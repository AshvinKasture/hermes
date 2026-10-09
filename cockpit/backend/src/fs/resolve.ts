import { lstat, readlink } from "node:fs/promises";
import { FsError, toFsError } from "./errors";

export interface Resolved {
  /** Canonical absolute path as the host sees it (symlinks resolved, no `..`). */
  virtual: string;
  /** Path inside this process (the host root mount + virtual). */
  real: string;
}

export interface ResolveOptions {
  /** Follow a symlink in the last component (default true). */
  followFinal?: boolean;
  /** Allow the last component to not exist yet (for create/rename targets). */
  allowMissingFinal?: boolean;
}

const MAX_SYMLINK_HOPS = 40;
const MAX_PATH_LENGTH = 4096;

export function normalizeRoot(root: string): string {
  const trimmed = root.replace(/\/+$/, "");
  return trimmed; // "/" becomes "" so root + "/etc" stays correct
}

export function toReal(root: string, virtual: string): string {
  return normalizeRoot(root) + (virtual === "/" ? "" : virtual) || "/";
}

export function isWithin(virtual: string, dir: string): boolean {
  return virtual === dir || virtual.startsWith(dir === "/" ? "/" : dir + "/");
}

export function parentOf(virtual: string): string | null {
  if (virtual === "/") return null;
  const i = virtual.lastIndexOf("/");
  return i <= 0 ? "/" : virtual.slice(0, i);
}

export function joinVirtual(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

const split = (p: string) => p.split("/").filter((s) => s !== "" && s !== ".");

/**
 * Resolve `input` as if `root` were the filesystem root (like chroot).
 *
 * Symlinks are followed manually so an absolute link such as /etc/os-release
 * -> /usr/lib/os-release resolves against the host tree, not this container's.
 * Because every filesystem call uses root + a normalised path, the result can
 * never point outside `root`, even with `..` or hostile links.
 */
export async function resolvePath(root: string, input: unknown, opts: ResolveOptions = {}): Promise<Resolved> {
  const { followFinal = true, allowMissingFinal = false } = opts;
  if (typeof input !== "string" || input.length === 0) throw new FsError(400, "invalid_path", "A path is required");
  if (input.includes("\0")) throw new FsError(400, "invalid_path", "Path contains a null byte");
  if (input.length > MAX_PATH_LENGTH) throw new FsError(400, "invalid_path", "Path is too long");
  if (!input.startsWith("/")) throw new FsError(400, "invalid_path", "Path must be absolute");

  let pending = split(input);
  let resolved: string[] = [];
  let hops = 0;

  while (pending.length > 0) {
    const part = pending.shift() as string;
    if (part === "..") {
      resolved.pop(); // at the root, ".." stays at the root
      continue;
    }
    const isLast = pending.length === 0;
    const candidate = "/" + [...resolved, part].join("/");
    let st;
    try {
      st = await lstat(toReal(root, candidate));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT" && allowMissingFinal && isLast) {
        resolved.push(part);
        continue;
      }
      throw toFsError(err);
    }
    if (st.isSymbolicLink() && (!isLast || followFinal)) {
      if (++hops > MAX_SYMLINK_HOPS) throw new FsError(400, "symlink_loop", "Too many levels of symbolic links");
      let target: string;
      try {
        target = await readlink(toReal(root, candidate));
      } catch (err) {
        throw toFsError(err);
      }
      if (target.startsWith("/")) resolved = [];
      pending = [...split(target), ...pending];
      continue;
    }
    resolved.push(part);
  }

  const virtual = "/" + resolved.join("/");
  return { virtual, real: toReal(root, virtual) };
}
