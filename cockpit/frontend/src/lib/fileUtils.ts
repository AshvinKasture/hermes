import type { FsEntry } from "./files";

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(path: string): string {
  if (path === "/") return "/";
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function baseName(path: string): string {
  return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
}

export function breadcrumbs(path: string): { name: string; path: string }[] {
  const out = [{ name: "/", path: "/" }];
  let acc = "";
  for (const part of path.split("/").filter(Boolean)) {
    acc += `/${part}`;
    out.push({ name: part, path: acc });
  }
  return out;
}

/**
 * Separator rendering helper: the root crumb already reads as "/", so a literal "/" before the
 * next segment would double up ("//home"). Only insert a separator between two non-root crumbs.
 */
export const needsSeparator = (crumbs: { path: string }[], i: number): boolean => i > 0 && crumbs[i - 1].path !== "/";

/** Every directory from the root down to `path`, inclusive. */
export const ancestors = (path: string): string[] => breadcrumbs(path).map((b) => b.path);

export type SortKey = "name" | "size" | "modified" | "type";
export type SortDir = "asc" | "desc";

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : "";
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Folders always come first. `dir` reverses the order within each group.
 * Ties on size/modified/type fall back to name A-Z so the order is stable.
 */
export function sortEntries(entries: FsEntry[], key: SortKey, dir: SortDir): FsEntry[] {
  const sign = dir === "asc" ? 1 : -1;
  const group = (e: FsEntry) => (e.kind === "dir" ? 0 : 1);
  const byName = (a: FsEntry, b: FsEntry) => collator.compare(a.name, b.name);
  return [...entries].sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b);
    if (key === "name") return byName(a, b) * sign;
    const primary =
      key === "size" ? a.size - b.size : key === "modified" ? a.mtimeMs - b.mtimeMs : collator.compare(extensionOf(a.name), extensionOf(b.name));
    return primary !== 0 ? primary * sign : byName(a, b);
  });
}

export interface Category {
  label: string;
  /** Tailwind classes for the badge. */
  tone: string;
}

const CATEGORIES: [string[], Category][] = [
  [["ts", "tsx", "js", "jsx", "mjs", "cjs"], { label: "JS", tone: "bg-amber-400/15 text-amber-300" }],
  [["py", "rb", "go", "rs", "java", "c", "h", "cpp", "cs", "php", "sh", "bash", "zsh"], { label: "</>", tone: "bg-sky-400/15 text-sky-300" }],
  [["json", "yaml", "yml", "toml", "ini", "conf", "env", "xml", "cfg"], { label: "{}", tone: "bg-violet-400/15 text-violet-300" }],
  [["md", "txt", "log", "rst"], { label: "TXT", tone: "bg-slate-400/15 text-slate-300" }],
  [["html", "css", "scss", "svg"], { label: "WEB", tone: "bg-orange-400/15 text-orange-300" }],
  [["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp"], { label: "IMG", tone: "bg-pink-400/15 text-pink-300" }],
  [["zip", "gz", "tgz", "tar", "xz", "bz2", "7z", "deb"], { label: "ZIP", tone: "bg-yellow-400/15 text-yellow-300" }],
  [["pdf", "doc", "docx", "xls", "xlsx", "csv"], { label: "DOC", tone: "bg-red-400/15 text-red-300" }],
  [["db", "sqlite", "sql"], { label: "DB", tone: "bg-emerald-400/15 text-emerald-300" }],
];

export function categoryFor(name: string): Category {
  const ext = extensionOf(name);
  return CATEGORIES.find(([exts]) => exts.includes(ext))?.[1] ?? { label: ext ? ext.slice(0, 3).toUpperCase() : "FILE", tone: "bg-ck-raised text-ck-muted" };
}

export function formatDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const date = d.toLocaleDateString([], sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
  return `${date}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** 0o755 → "rwxr-xr-x" */
export function formatMode(mode: number): string {
  const bits = "rwxrwxrwx";
  let out = "";
  for (let i = 0; i < 9; i++) out += mode & (1 << (8 - i)) ? bits[i] : "-";
  return out;
}
