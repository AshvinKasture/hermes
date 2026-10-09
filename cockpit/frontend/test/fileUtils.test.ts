import { describe, expect, it } from "vitest";
import { ancestors, baseName, breadcrumbs, categoryFor, extensionOf, formatDate, formatMode, joinPath, parentPath, sortEntries } from "../src/lib/fileUtils";
import type { FsEntry } from "../src/lib/files";

const e = (name: string, o: Partial<FsEntry> = {}): FsEntry => ({
  name, path: `/x/${name}`, kind: "file", size: 0, mtimeMs: 0, mode: 0o644, isSymlink: false, writable: true, ...o,
});

describe("paths", () => {
  it("joins, splits and names paths", () => {
    expect(joinPath("/", "etc")).toBe("/etc");
    expect(joinPath("/etc", "hosts")).toBe("/etc/hosts");
    expect(parentPath("/")).toBe("/");
    expect(parentPath("/etc")).toBe("/");
    expect(parentPath("/home/ashvin")).toBe("/home");
    expect(baseName("/home/ashvin")).toBe("ashvin");
    expect(baseName("/")).toBe("/");
  });

  it("builds breadcrumbs and ancestors", () => {
    expect(breadcrumbs("/")).toEqual([{ name: "/", path: "/" }]);
    expect(breadcrumbs("/home/ashvin")).toEqual([
      { name: "/", path: "/" },
      { name: "home", path: "/home" },
      { name: "ashvin", path: "/home/ashvin" },
    ]);
    expect(ancestors("/a/b")).toEqual(["/", "/a", "/a/b"]);
  });
});

describe("sortEntries", () => {
  const items = [
    e("b.txt", { size: 5, mtimeMs: 300 }),
    e("a.md", { size: 50, mtimeMs: 100 }),
    e("zdir", { kind: "dir" }),
    e("adir", { kind: "dir" }),
    e("file10.txt", { size: 5, mtimeMs: 200 }),
    e("file2.txt", { size: 5, mtimeMs: 200 }),
  ];
  const names = (l: FsEntry[]) => l.map((x) => x.name);

  it("always lists folders first and sorts names naturally", () => {
    expect(names(sortEntries(items, "name", "asc"))).toEqual(["adir", "zdir", "a.md", "b.txt", "file2.txt", "file10.txt"]);
  });

  it("reverses within groups only, keeping folders on top", () => {
    expect(names(sortEntries(items, "name", "desc"))).toEqual(["zdir", "adir", "file10.txt", "file2.txt", "b.txt", "a.md"]);
  });

  it("sorts by size and modified time with a stable name tiebreak", () => {
    expect(names(sortEntries(items, "size", "desc")).slice(2)).toEqual(["a.md", "b.txt", "file2.txt", "file10.txt"]);
    expect(names(sortEntries(items, "modified", "asc")).slice(2)).toEqual(["a.md", "file2.txt", "file10.txt", "b.txt"]);
  });

  it("sorts by type (extension)", () => {
    expect(names(sortEntries(items, "type", "asc")).slice(2)).toEqual(["a.md", "b.txt", "file2.txt", "file10.txt"]);
  });

  it("does not mutate its input", () => {
    const copy = [...items];
    sortEntries(items, "size", "asc");
    expect(items).toEqual(copy);
  });
});

describe("display helpers", () => {
  it("extracts extensions", () => {
    expect(extensionOf("a.TXT")).toBe("txt");
    expect(extensionOf(".bashrc")).toBe("");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
    expect(extensionOf("a.tar.gz")).toBe("gz");
  });

  it("categorises files", () => {
    expect(categoryFor("x.ts").label).toBe("JS");
    expect(categoryFor("x.json").label).toBe("{}");
    expect(categoryFor("x.png").label).toBe("IMG");
    expect(categoryFor("x.weird").label).toBe("WEI");
    expect(categoryFor("Makefile").label).toBe("FILE");
  });

  it("formats modes and dates", () => {
    expect(formatMode(0o755)).toBe("rwxr-xr-x");
    expect(formatMode(0o640)).toBe("rw-r-----");
    const now = new Date(2026, 9, 9, 12).getTime();
    expect(formatDate(new Date(2026, 9, 1, 8, 5).getTime(), now)).toMatch(/Oct.*08:05|1 Oct.*08:05/);
    expect(formatDate(new Date(2024, 0, 2, 8, 5).getTime(), now)).toMatch(/2024/);
  });
});
