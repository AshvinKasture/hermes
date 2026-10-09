import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, beforeEach, test } from "node:test";
import { FsError } from "../src/fs/errors";
import { FileService, validateName } from "../src/fs/service";

let root: string;
let svc: FileService;
const HOME = "/home/ashvin";
const R = (v: string) => path.join(root, v);
const code = (e: unknown) => (e instanceof FsError ? e.code : String(e));
const status = (e: unknown) => (e instanceof FsError ? e.status : 0);

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-fs-"));
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
  for (const d of fs.readdirSync(root)) fs.rmSync(R(d), { recursive: true, force: true });
  fs.mkdirSync(R("home/ashvin/docs"), { recursive: true });
  fs.mkdirSync(R("etc"), { recursive: true });
  fs.mkdirSync(R("usr/lib"), { recursive: true });
  fs.writeFileSync(R("home/ashvin/hello.txt"), "hello world\n");
  fs.writeFileSync(R("home/ashvin/docs/notes.md"), "# notes");
  fs.writeFileSync(R("etc/hosts"), "127.0.0.1 localhost\n");
  fs.writeFileSync(R("usr/lib/os-release"), "NAME=x");
  fs.symlinkSync("/usr/lib/os-release", R("etc/os-release"));
  fs.symlinkSync("docs", R("home/ashvin/docs-link"));
  fs.symlinkSync("missing", R("home/ashvin/broken"));
  svc = new FileService({ root, home: HOME, maxEditBytes: 1024, maxUploadBytes: 2048 });
});

test("list returns entries with kinds, sizes, symlink info and the writable flag", async () => {
  const l = await svc.list(HOME);
  assert.equal(l.path, HOME);
  assert.equal(l.parent, "/home");
  assert.equal(l.writable, true);
  const by = Object.fromEntries(l.entries.map((e) => [e.name, e]));
  assert.equal(by["hello.txt"].kind, "file");
  assert.equal(by["hello.txt"].size, 12);
  assert.equal(by.docs.kind, "dir");
  assert.equal(by["docs-link"].isSymlink, true);
  assert.equal(by["docs-link"].kind, "dir");
  assert.equal(by["docs-link"].targetPath, "/home/ashvin/docs");
  assert.equal(by.broken.broken, true);
  assert.equal(by.broken.kind, "other");
  assert.ok(l.entries.every((e) => e.writable));
});

test("outside home everything is read-only", async () => {
  const l = await svc.list("/etc");
  assert.equal(l.writable, false);
  assert.ok(l.entries.every((e) => !e.writable));
  const link = l.entries.find((e) => e.name === "os-release")!;
  assert.equal(link.targetPath, "/usr/lib/os-release");
  assert.equal((await svc.list("/")).parent, null);
});

test("list rejects files and missing paths", async () => {
  await assert.rejects(svc.list(`${HOME}/hello.txt`), (e) => code(e) === "not_a_directory");
  await assert.rejects(svc.list("/nope"), (e) => status(e) === 404);
});

test("read returns text content, etag and writability", async () => {
  const f = await svc.read(`${HOME}/hello.txt`);
  assert.equal(f.content, "hello world\n");
  assert.equal(f.writable, true);
  assert.equal(f.binary, false);
  assert.match(f.etag, /^\d/);
  const ro = await svc.read("/etc/hosts");
  assert.equal(ro.writable, false);
  assert.equal(ro.content, "127.0.0.1 localhost\n");
  assert.equal((await svc.read("/etc/os-release")).path, "/usr/lib/os-release"); // symlink resolved inside root
});

test("read flags binary, invalid UTF-8 and oversized files without returning content", async () => {
  fs.writeFileSync(R("home/ashvin/bin.dat"), Buffer.from([1, 2, 0, 3]));
  fs.writeFileSync(R("home/ashvin/latin1.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  fs.writeFileSync(R("home/ashvin/big.txt"), "x".repeat(2000));
  const bin = await svc.read(`${HOME}/bin.dat`);
  assert.equal(bin.binary, true);
  assert.equal(bin.content, null);
  assert.equal((await svc.read(`${HOME}/latin1.txt`)).binary, true);
  const big = await svc.read(`${HOME}/big.txt`);
  assert.equal(big.tooLarge, true);
  assert.equal(big.content, null);
});

test("read rejects directories and special files", async () => {
  await assert.rejects(svc.read(`${HOME}/docs`), (e) => code(e) === "is_a_directory");
});

test("write replaces content atomically and keeps mode and no temp files", async () => {
  fs.chmodSync(R("home/ashvin/hello.txt"), 0o640);
  const before = await svc.read(`${HOME}/hello.txt`);
  const res = await svc.write(`${HOME}/hello.txt`, "updated ✓\n", before.etag);
  assert.equal(fs.readFileSync(R("home/ashvin/hello.txt"), "utf8"), "updated ✓\n");
  assert.equal(fs.statSync(R("home/ashvin/hello.txt")).mode & 0o777, 0o640);
  assert.notEqual(res.etag, before.etag);
  assert.deepEqual(fs.readdirSync(R("home/ashvin")).filter((n) => n.includes(".cockpit-")), []);
});

test("write detects a concurrent change (conflict) and leaves the file alone", async () => {
  const f = await svc.read(`${HOME}/hello.txt`);
  fs.writeFileSync(R("home/ashvin/hello.txt"), "changed elsewhere, longer\n");
  await assert.rejects(svc.write(`${HOME}/hello.txt`, "mine", f.etag), (e) => code(e) === "conflict" && status(e) === 409);
  assert.equal(fs.readFileSync(R("home/ashvin/hello.txt"), "utf8"), "changed elsewhere, longer\n");
  // an explicit overwrite (no etag) is allowed
  await svc.write(`${HOME}/hello.txt`, "forced");
  assert.equal(fs.readFileSync(R("home/ashvin/hello.txt"), "utf8"), "forced");
});

test("write is refused outside home, on read-only files, and for bad input", async () => {
  await assert.rejects(svc.write("/etc/hosts", "x"), (e) => code(e) === "read_only" && status(e) === 403);
  assert.equal(fs.readFileSync(R("etc/hosts"), "utf8"), "127.0.0.1 localhost\n");
  fs.chmodSync(R("home/ashvin/hello.txt"), 0o444);
  if (process.getuid?.() !== 0) {
    await assert.rejects(svc.write(`${HOME}/hello.txt`, "x"), (e) => code(e) === "permission_denied");
  }
  await assert.rejects(svc.write(`${HOME}/docs`, "x"), (e) => code(e) === "not_a_regular_file");
  await assert.rejects(svc.write(`${HOME}/hello.txt`, 5 as never), (e) => code(e) === "invalid_body");
  await assert.rejects(svc.write(`${HOME}/hello.txt`, "x".repeat(2000)), (e) => status(e) === 413);
});

test("a symlink out of home cannot be used to write outside home", async () => {
  fs.symlinkSync("/etc/hosts", R("home/ashvin/hosts-link"));
  await assert.rejects(svc.write(`${HOME}/hosts-link`, "pwned"), (e) => code(e) === "read_only");
  assert.equal(fs.readFileSync(R("etc/hosts"), "utf8"), "127.0.0.1 localhost\n");
  // and a symlinked directory pointing out cannot receive new files
  fs.symlinkSync("/etc", R("home/ashvin/etc-link"));
  await assert.rejects(svc.create(`${HOME}/etc-link`, "evil.txt", "file"), (e) => code(e) === "read_only");
  assert.equal(fs.existsSync(R("etc/evil.txt")), false);
});

test("create makes files and folders, and refuses duplicates and bad names", async () => {
  const f = await svc.create(HOME, "new.txt", "file");
  assert.equal(f.kind, "file");
  assert.equal(fs.readFileSync(R("home/ashvin/new.txt"), "utf8"), "");
  const d = await svc.create(`${HOME}/docs`, "sub", "dir");
  assert.equal(d.kind, "dir");
  await assert.rejects(svc.create(HOME, "new.txt", "file"), (e) => code(e) === "exists");
  await assert.rejects(svc.create(HOME, "../x", "file"), (e) => code(e) === "invalid_name");
  await assert.rejects(svc.create(HOME, "ok", "symlink" as never), (e) => code(e) === "invalid_body");
  await assert.rejects(svc.create("/etc", "x", "file"), (e) => code(e) === "read_only");
  await assert.rejects(svc.create(`${HOME}/hello.txt`, "x", "file"), (e) => code(e) === "not_a_directory");
});

test("validateName", () => {
  for (const ok of ["a", "file.txt", ".hidden", "with space", "ünï"]) assert.equal(validateName(ok), ok);
  for (const bad of ["", ".", "..", "a/b", "a\0b", "x".repeat(300), undefined, 5]) {
    assert.throws(() => validateName(bad), (e) => code(e) === "invalid_name", String(bad).slice(0, 10));
  }
});

test("rename moves within home, refuses overwrite, outside-home, and self-moves", async () => {
  const e = await svc.rename(`${HOME}/hello.txt`, `${HOME}/docs/renamed.txt`);
  assert.equal(e.path, `${HOME}/docs/renamed.txt`);
  assert.equal(fs.existsSync(R("home/ashvin/hello.txt")), false);
  await assert.rejects(svc.rename(`${HOME}/docs/renamed.txt`, `${HOME}/docs/notes.md`), (x) => code(x) === "exists");
  await assert.rejects(svc.rename(`${HOME}/docs/notes.md`, "/etc/notes.md"), (x) => code(x) === "read_only");
  await assert.rejects(svc.rename("/etc/hosts", `${HOME}/hosts`), (x) => code(x) === "read_only");
  await assert.rejects(svc.rename(`${HOME}/docs`, `${HOME}/docs/inner`), (x) => code(x) === "invalid_move");
  await assert.rejects(svc.rename(`${HOME}/docs`, `${HOME}/docs`), (x) => code(x) === "same_path");
  await assert.rejects(svc.rename(HOME, `${HOME}/x`), (x) => code(x) === "protected" || code(x) === "invalid_move");
});

test("renaming a symlink renames the link, not its target", async () => {
  await svc.rename(`${HOME}/docs-link`, `${HOME}/docs-link2`);
  assert.equal(fs.lstatSync(R("home/ashvin/docs-link2")).isSymbolicLink(), true);
  assert.equal(fs.existsSync(R("home/ashvin/docs/notes.md")), true);
});

test("remove moves to the freedesktop trash with metadata and de-duplicates names", async () => {
  const res = await svc.remove(`${HOME}/hello.txt`);
  assert.equal(res.trashed, true);
  assert.equal(fs.existsSync(R("home/ashvin/hello.txt")), false);
  const trash = R("home/ashvin/.local/share/Trash");
  assert.equal(fs.readFileSync(path.join(trash, "files/hello.txt"), "utf8"), "hello world\n");
  const info = fs.readFileSync(path.join(trash, "info/hello.txt.trashinfo"), "utf8");
  assert.match(info, /^\[Trash Info\]\nPath=\/home\/ashvin\/hello\.txt\nDeletionDate=\d{4}-\d\d-\d\dT/);

  fs.writeFileSync(R("home/ashvin/hello.txt"), "second");
  const res2 = await svc.remove(`${HOME}/hello.txt`);
  assert.equal(res2.name, "hello.txt.1");
  assert.equal(fs.readFileSync(path.join(trash, "files/hello.txt"), "utf8"), "hello world\n");
});

test("remove handles folders and symlinks without touching targets", async () => {
  await svc.remove(`${HOME}/docs-link`);
  assert.equal(fs.existsSync(R("home/ashvin/docs/notes.md")), true);
  await svc.remove(`${HOME}/docs`);
  assert.equal(fs.existsSync(R("home/ashvin/.local/share/Trash/files/docs/notes.md")), true);
});

test("items already in the trash are deleted permanently; protected folders and read-only paths refuse", async () => {
  await svc.remove(`${HOME}/hello.txt`);
  const inTrash = `${HOME}/.local/share/Trash/files/hello.txt`;
  const res = await svc.remove(inTrash);
  assert.equal(res.permanent, true);
  assert.equal(fs.existsSync(R("home/ashvin/.local/share/Trash/files/hello.txt")), false);
  await assert.rejects(svc.remove(HOME), (e) => code(e) === "protected");
  await assert.rejects(svc.remove("/"), (e) => code(e) === "read_only");
  await assert.rejects(svc.remove("/etc/hosts"), (e) => code(e) === "read_only");
  await assert.rejects(svc.remove(svc.trashDir), (e) => code(e) === "protected");
});

test("download streams a file and rejects folders", async () => {
  const d = await svc.openDownload(`${HOME}/hello.txt`);
  assert.equal(d.name, "hello.txt");
  assert.equal(d.size, 12);
  const chunks: Buffer[] = [];
  for await (const c of d.stream) chunks.push(c as Buffer);
  assert.equal(Buffer.concat(chunks).toString(), "hello world\n");
  await assert.rejects(svc.openDownload(`${HOME}/docs`), (e) => code(e) === "is_a_directory");
  assert.equal((await svc.openDownload("/etc/hosts")).size, 20); // read-only files can be downloaded
});

test("upload writes a new file, refuses to overwrite by default, and can overwrite", async () => {
  const e = await svc.upload(`${HOME}/docs`, "up.txt", Readable.from([Buffer.from("abc")]), false);
  assert.equal(e.size, 3);
  assert.equal(fs.readFileSync(R("home/ashvin/docs/up.txt"), "utf8"), "abc");
  await assert.rejects(svc.upload(`${HOME}/docs`, "up.txt", Readable.from([Buffer.from("zzz")]), false), (x) => code(x) === "exists");
  assert.equal(fs.readFileSync(R("home/ashvin/docs/up.txt"), "utf8"), "abc");
  await svc.upload(`${HOME}/docs`, "up.txt", Readable.from([Buffer.from("new")]), true);
  assert.equal(fs.readFileSync(R("home/ashvin/docs/up.txt"), "utf8"), "new");
  assert.deepEqual(fs.readdirSync(R("home/ashvin/docs")).filter((n) => n.includes(".cockpit-")), []);
});

test("upload enforces the size limit, cleans up, and respects read-only zones", async () => {
  await assert.rejects(
    svc.upload(HOME, "big.bin", Readable.from([Buffer.alloc(1500), Buffer.alloc(1500)]), false),
    (e) => status(e) === 413
  );
  assert.equal(fs.existsSync(R("home/ashvin/big.bin")), false);
  assert.deepEqual(fs.readdirSync(R("home/ashvin")).filter((n) => n.includes(".cockpit-")), []);
  await assert.rejects(svc.upload("/etc", "x", Readable.from([Buffer.from("x")]), false), (e) => code(e) === "read_only");
  await assert.rejects(svc.upload(HOME, "../x", Readable.from([Buffer.from("x")]), false), (e) => code(e) === "invalid_name");
  await assert.rejects(svc.upload(`${HOME}/hello.txt`, "x", Readable.from([Buffer.from("x")]), false), (e) => code(e) === "not_a_directory");
});

test("search finds names case-insensitively, skips symlink cycles, and validates input", async () => {
  fs.symlinkSync(HOME, R("home/ashvin/docs/cycle")); // would loop if followed
  fs.mkdirSync(R("home/ashvin/docs/deep"), { recursive: true });
  fs.writeFileSync(R("home/ashvin/docs/deep/Notes-2.txt"), "");
  const r = await svc.search(HOME, "NOTES");
  assert.deepEqual(r.results.map((x) => x.path).sort(), [`${HOME}/docs/deep/Notes-2.txt`, `${HOME}/docs/notes.md`].sort());
  assert.equal(r.truncated, false);
  assert.equal((await svc.search("/etc", "hosts")).results[0].path, "/etc/hosts");
  assert.deepEqual((await svc.search(HOME, "zzzz-no-match")).results, []);
  await assert.rejects(svc.search(HOME, "  "), (e) => code(e) === "invalid_query");
  await assert.rejects(svc.search(`${HOME}/hello.txt`, "a"), (e) => code(e) === "not_a_directory");
});

test("search caps the number of results", async () => {
  for (let i = 0; i < 250; i++) fs.writeFileSync(R(`home/ashvin/docs/match-${i}.txt`), "");
  const r = await svc.search(HOME, "match-");
  assert.equal(r.results.length, 200);
  assert.equal(r.truncated, true);
});

test("info exposes the zone and limits", () => {
  assert.deepEqual(svc.info(), { home: HOME, trashDir: `${HOME}/.local/share/Trash`, maxEditBytes: 1024, maxUploadBytes: 2048 });
  assert.equal(svc.inWritableZone("/home/ashvinx"), false);
  assert.equal(svc.inWritableZone(`${HOME}/a`), true);
});
