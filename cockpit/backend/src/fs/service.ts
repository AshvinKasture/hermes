import crypto from "node:crypto";
import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FsError, toFsError } from "./errors";
import { isWithin, joinVirtual, parentOf, resolvePath, toReal } from "./resolve";

export interface FsConfig {
  /** Where the host filesystem is visible inside this process ("/" or "/host"). */
  root: string;
  /** Host path of the read-write zone, e.g. /home/ashvin. Everything else is read-only. */
  home: string;
  maxEditBytes: number;
  maxUploadBytes: number;
}

export type EntryKind = "file" | "dir" | "other";

export interface Entry {
  name: string;
  path: string;
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  mode: number;
  isSymlink: boolean;
  linkTarget?: string;
  /** Resolved location of a symlink's target. */
  targetPath?: string;
  broken?: boolean;
  /** True if this entry lives in the read-write zone (can be renamed/deleted). */
  writable: boolean;
}

export interface Listing {
  path: string;
  parent: string | null;
  writable: boolean;
  entries: Entry[];
  truncated: boolean;
}

export interface FileContent {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  etag: string;
  mode: number;
  writable: boolean;
  binary: boolean;
  tooLarge: boolean;
  content: string | null;
}

export interface SearchResult {
  results: { name: string; path: string; kind: EntryKind }[];
  truncated: boolean;
}

const MAX_LIST_ENTRIES = 5000;
const SEARCH_MAX_RESULTS = 200;
const SEARCH_MAX_DIRS = 20000;
const SEARCH_MAX_MS = 4000;
const SEARCH_SKIP = new Set(["/proc", "/sys", "/dev", "/run"]);
const CHUNK = 64;

const kindOf = (st: { isFile(): boolean; isDirectory(): boolean }): EntryKind => (st.isDirectory() ? "dir" : st.isFile() ? "file" : "other");
const etagOf = (st: { mtimeMs: number; size: number; ino: number }) => `${st.mtimeMs}:${st.size}:${st.ino}`;
const tmpName = (name: string) => `.${name.slice(0, 100)}.cockpit-${crypto.randomBytes(6).toString("hex")}.tmp`;

export function validateName(name: unknown): string {
  if (typeof name !== "string" || name.length === 0) throw new FsError(400, "invalid_name", "A name is required");
  if (name === "." || name === "..") throw new FsError(400, "invalid_name", "Invalid name");
  if (name.includes("/") || name.includes("\0")) throw new FsError(400, "invalid_name", "Names cannot contain '/' or null bytes");
  if (Buffer.byteLength(name) > 255) throw new FsError(400, "invalid_name", "Name is too long");
  return name;
}

export class FileService {
  readonly trashDir: string;

  constructor(private cfg: FsConfig) {
    this.trashDir = joinVirtual(joinVirtual(joinVirtual(cfg.home, ".local"), "share"), "Trash");
  }

  get home(): string {
    return this.cfg.home;
  }

  info() {
    return { home: this.cfg.home, trashDir: this.trashDir, maxEditBytes: this.cfg.maxEditBytes, maxUploadBytes: this.cfg.maxUploadBytes };
  }

  inWritableZone(virtual: string): boolean {
    return isWithin(virtual, this.cfg.home);
  }

  private requireWritable(virtual: string): void {
    if (!this.inWritableZone(virtual)) throw new FsError(403, "read_only", "This location is read-only");
  }

  private real(virtual: string): string {
    return toReal(this.cfg.root, virtual);
  }

  private async entryFor(dirVirtual: string, name: string): Promise<Entry | null> {
    const virtual = joinVirtual(dirVirtual, name);
    const real = this.real(virtual);
    let st;
    try {
      st = await fs.lstat(real);
    } catch {
      return null; // vanished between readdir and lstat
    }
    const entry: Entry = {
      name,
      path: virtual,
      kind: kindOf(st),
      size: st.isFile() ? st.size : 0,
      mtimeMs: st.mtimeMs,
      mode: st.mode & 0o7777,
      isSymlink: st.isSymbolicLink(),
      writable: this.inWritableZone(virtual),
    };
    if (st.isSymbolicLink()) {
      try {
        entry.linkTarget = await fs.readlink(real);
      } catch {
        /* unreadable link text */
      }
      try {
        const r = await resolvePath(this.cfg.root, virtual);
        const target = await fs.lstat(r.real);
        entry.kind = kindOf(target);
        entry.size = target.isFile() ? target.size : 0;
        entry.targetPath = r.virtual;
      } catch {
        entry.broken = true;
        entry.kind = "other";
      }
    }
    return entry;
  }

  async list(input: unknown): Promise<Listing> {
    try {
      const r = await resolvePath(this.cfg.root, input);
      const st = await fs.lstat(r.real);
      if (!st.isDirectory()) throw new FsError(400, "not_a_directory", "Not a directory");
      const dirents = await fs.readdir(r.real);
      const truncated = dirents.length > MAX_LIST_ENTRIES;
      const names = dirents.slice(0, MAX_LIST_ENTRIES);
      const entries: Entry[] = [];
      for (let i = 0; i < names.length; i += CHUNK) {
        const batch = await Promise.all(names.slice(i, i + CHUNK).map((n) => this.entryFor(r.virtual, n)));
        for (const e of batch) if (e) entries.push(e);
      }
      return { path: r.virtual, parent: parentOf(r.virtual), writable: this.inWritableZone(r.virtual), entries, truncated };
    } catch (err) {
      throw toFsError(err);
    }
  }

  async read(input: unknown): Promise<FileContent> {
    try {
      const r = await resolvePath(this.cfg.root, input);
      const st = await fs.lstat(r.real);
      if (st.isDirectory()) throw new FsError(400, "is_a_directory", "Path is a directory");
      if (!st.isFile()) throw new FsError(400, "not_a_regular_file", "Not a regular file");

      let writable = false;
      if (this.inWritableZone(r.virtual)) {
        try {
          await fs.access(r.real, fs.constants.W_OK);
          writable = true;
        } catch {
          writable = false;
        }
      }
      const base: FileContent = {
        path: r.virtual,
        name: path.posix.basename(r.virtual),
        size: st.size,
        mtimeMs: st.mtimeMs,
        etag: etagOf(st),
        mode: st.mode & 0o7777,
        writable,
        binary: false,
        tooLarge: false,
        content: null,
      };
      if (st.size > this.cfg.maxEditBytes) return { ...base, tooLarge: true };

      const buf = await fs.readFile(r.real);
      if (buf.subarray(0, 8192).includes(0)) return { ...base, binary: true };
      try {
        return { ...base, content: new TextDecoder("utf-8", { fatal: true }).decode(buf) };
      } catch {
        return { ...base, binary: true }; // not valid UTF-8: don't risk corrupting it on save
      }
    } catch (err) {
      throw toFsError(err);
    }
  }

  async write(input: unknown, content: unknown, etag: unknown): Promise<{ etag: string; size: number; mtimeMs: number }> {
    try {
      if (typeof content !== "string") throw new FsError(400, "invalid_body", "content must be a string");
      const bytes = Buffer.from(content, "utf8");
      if (bytes.length > this.cfg.maxEditBytes) throw new FsError(413, "too_large", "File is too large to save here");
      const r = await resolvePath(this.cfg.root, input);
      this.requireWritable(r.virtual);
      const st = await fs.lstat(r.real);
      if (!st.isFile()) throw new FsError(400, "not_a_regular_file", "Not a regular file");
      await fs.access(r.real, fs.constants.W_OK); // respect the file's own permissions
      if (typeof etag === "string" && etag !== etagOf(st)) {
        throw new FsError(409, "conflict", "The file changed on disk since you opened it");
      }

      const dir = path.dirname(r.real);
      const tmp = path.join(dir, tmpName(path.basename(r.real)));
      try {
        await fs.writeFile(tmp, bytes, { flag: "wx", mode: st.mode & 0o7777 });
        await fs.chmod(tmp, st.mode & 0o7777); // umask must not strip the original bits
        await fs.rename(tmp, r.real);
      } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      const after = await fs.lstat(r.real);
      return { etag: etagOf(after), size: after.size, mtimeMs: after.mtimeMs };
    } catch (err) {
      throw toFsError(err);
    }
  }

  async create(dirInput: unknown, nameInput: unknown, type: unknown): Promise<Entry> {
    try {
      const name = validateName(nameInput);
      if (type !== "file" && type !== "dir") throw new FsError(400, "invalid_body", "type must be 'file' or 'dir'");
      const d = await resolvePath(this.cfg.root, dirInput);
      this.requireWritable(d.virtual);
      const st = await fs.lstat(d.real);
      if (!st.isDirectory()) throw new FsError(400, "not_a_directory", "Not a directory");
      const target = path.join(d.real, name);
      try {
        if (type === "dir") await fs.mkdir(target, { mode: 0o755 });
        else await (await fs.open(target, "wx", 0o644)).close();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new FsError(409, "exists", `"${name}" already exists`);
        throw err;
      }
      return (await this.entryFor(d.virtual, name)) as Entry;
    } catch (err) {
      throw toFsError(err);
    }
  }

  private guardRoots(virtual: string): void {
    if (virtual === "/" || virtual === this.cfg.home || virtual === this.trashDir) {
      throw new FsError(400, "protected", "This folder cannot be renamed or deleted");
    }
  }

  async rename(fromInput: unknown, toInput: unknown): Promise<Entry> {
    try {
      const from = await resolvePath(this.cfg.root, fromInput, { followFinal: false });
      const to = await resolvePath(this.cfg.root, toInput, { followFinal: false, allowMissingFinal: true });
      this.requireWritable(from.virtual);
      this.requireWritable(to.virtual);
      this.guardRoots(from.virtual);
      validateName(path.posix.basename(to.virtual));
      if (to.virtual === from.virtual) throw new FsError(400, "same_path", "Source and destination are the same");
      if (isWithin(to.virtual, from.virtual)) throw new FsError(400, "invalid_move", "Cannot move a folder into itself");
      try {
        await fs.lstat(to.real);
        throw new FsError(409, "exists", "A file or folder with that name already exists");
      } catch (err) {
        if (err instanceof FsError) throw err;
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      try {
        await fs.rename(from.real, to.real);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EXDEV") throw new FsError(400, "cross_device", "Cannot move across filesystems");
        throw err;
      }
      return (await this.entryFor(parentOf(to.virtual) as string, path.posix.basename(to.virtual))) as Entry;
    } catch (err) {
      throw toFsError(err);
    }
  }

  /** Move to the freedesktop trash; items already inside the trash are deleted permanently. */
  async remove(input: unknown): Promise<{ trashed: boolean; permanent: boolean; name: string }> {
    try {
      const r = await resolvePath(this.cfg.root, input, { followFinal: false });
      this.requireWritable(r.virtual);
      this.guardRoots(r.virtual);
      const name = path.posix.basename(r.virtual);

      if (isWithin(r.virtual, this.trashDir)) {
        await fs.rm(r.real, { recursive: true });
        return { trashed: false, permanent: true, name };
      }

      const filesDir = this.real(joinVirtual(this.trashDir, "files"));
      const infoDir = this.real(joinVirtual(this.trashDir, "info"));
      await fs.mkdir(filesDir, { recursive: true, mode: 0o700 });
      await fs.mkdir(infoDir, { recursive: true, mode: 0o700 });

      let slot = name;
      for (let n = 1; ; n++) {
        try {
          await fs.lstat(path.join(filesDir, slot));
          slot = `${name}.${n}`;
        } catch {
          break;
        }
      }
      const date = new Date().toISOString().slice(0, 19);
      const infoText = `[Trash Info]\nPath=${encodeURI(r.virtual)}\nDeletionDate=${date}\n`;
      const infoPath = path.join(infoDir, `${slot}.trashinfo`);
      await fs.writeFile(infoPath, infoText, { flag: "wx", mode: 0o600 });
      try {
        await fs.rename(r.real, path.join(filesDir, slot));
      } catch (err) {
        await fs.rm(infoPath, { force: true });
        if ((err as NodeJS.ErrnoException).code === "EXDEV") throw new FsError(400, "cross_device", "Cannot move to trash across filesystems");
        throw err;
      }
      return { trashed: true, permanent: false, name: slot };
    } catch (err) {
      throw toFsError(err);
    }
  }

  async openDownload(input: unknown): Promise<{ stream: ReadStream; name: string; size: number }> {
    try {
      const r = await resolvePath(this.cfg.root, input);
      const st = await fs.lstat(r.real);
      if (st.isDirectory()) throw new FsError(400, "is_a_directory", "Folders cannot be downloaded");
      if (!st.isFile()) throw new FsError(400, "not_a_regular_file", "Not a regular file");
      await fs.access(r.real, fs.constants.R_OK);
      return { stream: createReadStream(r.real), name: path.posix.basename(r.virtual), size: st.size };
    } catch (err) {
      throw toFsError(err);
    }
  }

  async upload(dirInput: unknown, nameInput: unknown, body: Readable, overwrite: boolean): Promise<Entry> {
    let tmp: string | null = null;
    try {
      const name = validateName(nameInput);
      const d = await resolvePath(this.cfg.root, dirInput);
      this.requireWritable(d.virtual);
      if (!(await fs.lstat(d.real)).isDirectory()) throw new FsError(400, "not_a_directory", "Not a directory");

      const dest = path.join(d.real, name);
      if (!overwrite) {
        try {
          await fs.lstat(dest);
          throw new FsError(409, "exists", `"${name}" already exists`);
        } catch (err) {
          if (err instanceof FsError) throw err;
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }

      tmp = path.join(d.real, tmpName(name));
      let received = 0;
      const limit = this.cfg.maxUploadBytes;
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          received += chunk.length;
          if (received > limit) cb(new FsError(413, "too_large", "Upload exceeds the size limit"));
          else cb(null, chunk);
        },
      });
      await pipeline(body, counter, createWriteStream(tmp, { flags: "wx", mode: 0o644 }));

      if (overwrite) {
        await fs.rename(tmp, dest);
      } else {
        try {
          await fs.link(tmp, dest); // fails atomically if it appeared meanwhile
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new FsError(409, "exists", `"${name}" already exists`);
          throw err;
        }
        await fs.rm(tmp);
      }
      tmp = null;
      return (await this.entryFor(d.virtual, name)) as Entry;
    } catch (err) {
      if (tmp) await fs.rm(tmp, { force: true });
      throw toFsError(err);
    }
  }

  async search(input: unknown, query: unknown): Promise<SearchResult> {
    try {
      if (typeof query !== "string" || query.trim().length === 0) throw new FsError(400, "invalid_query", "A search term is required");
      const needle = query.trim().toLowerCase();
      const start = await resolvePath(this.cfg.root, input);
      if (!(await fs.lstat(start.real)).isDirectory()) throw new FsError(400, "not_a_directory", "Not a directory");

      const results: SearchResult["results"] = [];
      const queue = [start.virtual];
      const deadline = Date.now() + SEARCH_MAX_MS;
      let dirs = 0;
      let truncated = false;

      while (queue.length > 0) {
        if (results.length >= SEARCH_MAX_RESULTS || dirs >= SEARCH_MAX_DIRS || Date.now() > deadline) {
          truncated = true;
          break;
        }
        const dir = queue.shift() as string;
        dirs++;
        let dirents;
        try {
          dirents = await fs.readdir(this.real(dir), { withFileTypes: true });
        } catch {
          continue; // unreadable directory: skip
        }
        for (const d of dirents) {
          const virtual = joinVirtual(dir, d.name);
          if (d.name.toLowerCase().includes(needle)) {
            results.push({ name: d.name, path: virtual, kind: d.isDirectory() ? "dir" : d.isFile() ? "file" : "other" });
            if (results.length >= SEARCH_MAX_RESULTS) {
              truncated = true;
              break;
            }
          }
          // Real directories only: never follow symlinks, so cycles are impossible.
          if (d.isDirectory() && !SEARCH_SKIP.has(virtual)) queue.push(virtual);
        }
      }
      return { results, truncated };
    } catch (err) {
      throw toFsError(err);
    }
  }
}
