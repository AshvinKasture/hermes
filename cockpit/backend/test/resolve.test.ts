import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { FsError, toFsError } from "../src/fs/errors";
import { isWithin, joinVirtual, parentOf, resolvePath, toReal } from "../src/fs/resolve";

let root: string;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-resolve-"));
  const mk = (p: string) => fs.mkdirSync(path.join(root, p), { recursive: true });
  mk("home/ashvin/dir");
  mk("etc");
  mk("usr/lib");
  fs.writeFileSync(path.join(root, "home/ashvin/a.txt"), "a");
  fs.writeFileSync(path.join(root, "usr/lib/os-release"), "x");
  // absolute link: must resolve inside root, not against the real filesystem
  fs.symlinkSync("/usr/lib/os-release", path.join(root, "etc/os-release"));
  fs.symlinkSync("../usr/lib/os-release", path.join(root, "etc/os-release-rel"));
  fs.symlinkSync("dir", path.join(root, "home/ashvin/dirlink"));
  fs.symlinkSync("/etc", path.join(root, "home/ashvin/to-etc"));
  fs.symlinkSync("../../../../../../../../etc", path.join(root, "home/ashvin/escape"));
  fs.symlinkSync("loop-b", path.join(root, "home/ashvin/loop-a"));
  fs.symlinkSync("loop-a", path.join(root, "home/ashvin/loop-b"));
  fs.symlinkSync("nowhere", path.join(root, "home/ashvin/dangling"));
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

const code = (e: unknown) => (e instanceof FsError ? e.code : String(e));

test("resolves plain paths and the root", async () => {
  assert.deepEqual(await resolvePath(root, "/"), { virtual: "/", real: root });
  const r = await resolvePath(root, "/home/ashvin/a.txt");
  assert.equal(r.virtual, "/home/ashvin/a.txt");
  assert.equal(r.real, path.join(root, "home/ashvin/a.txt"));
});

test("normalises duplicate slashes, dots and trailing slashes", async () => {
  assert.equal((await resolvePath(root, "//home///ashvin/./dir/")).virtual, "/home/ashvin/dir");
  assert.equal((await resolvePath(root, "/home/ashvin/dir/../a.txt")).virtual, "/home/ashvin/a.txt");
});

test("'..' can never climb above the root", async () => {
  assert.equal((await resolvePath(root, "/../../../etc")).virtual, "/etc");
  assert.equal((await resolvePath(root, "/..")).virtual, "/");
});

test("absolute symlinks resolve against the root, not the real filesystem", async () => {
  const r = await resolvePath(root, "/etc/os-release");
  assert.equal(r.virtual, "/usr/lib/os-release");
  assert.equal(r.real, path.join(root, "usr/lib/os-release"));
  assert.equal((await resolvePath(root, "/home/ashvin/to-etc")).virtual, "/etc");
});

test("relative symlinks and symlinked directories resolve", async () => {
  assert.equal((await resolvePath(root, "/etc/os-release-rel")).virtual, "/usr/lib/os-release");
  assert.equal((await resolvePath(root, "/home/ashvin/dirlink")).virtual, "/home/ashvin/dir");
  assert.equal((await resolvePath(root, "/home/ashvin/dirlink/..")).virtual, "/home/ashvin");
});

test("a symlink with excess '..' is clamped to the root", async () => {
  const r = await resolvePath(root, "/home/ashvin/escape");
  assert.equal(r.virtual, "/etc");
  assert.ok(r.real.startsWith(root));
});

test("followFinal=false returns the link itself", async () => {
  const r = await resolvePath(root, "/home/ashvin/dirlink", { followFinal: false });
  assert.equal(r.virtual, "/home/ashvin/dirlink");
  // intermediate links are still followed
  assert.equal((await resolvePath(root, "/home/ashvin/dirlink/x", { followFinal: false, allowMissingFinal: true })).virtual, "/home/ashvin/dir/x");
});

test("symlink loops and dangling links are rejected", async () => {
  await assert.rejects(resolvePath(root, "/home/ashvin/loop-a"), (e) => code(e) === "symlink_loop");
  await assert.rejects(resolvePath(root, "/home/ashvin/dangling"), (e) => code(e) === "not_found");
});

test("missing paths: 404 unless the final component is allowed to be missing", async () => {
  await assert.rejects(resolvePath(root, "/home/ashvin/nope"), (e) => code(e) === "not_found");
  assert.equal((await resolvePath(root, "/home/ashvin/new.txt", { allowMissingFinal: true })).virtual, "/home/ashvin/new.txt");
  await assert.rejects(resolvePath(root, "/home/ashvin/nope/deeper", { allowMissingFinal: true }), (e) => code(e) === "not_found");
});

test("a file used as a directory is a 400", async () => {
  await assert.rejects(resolvePath(root, "/home/ashvin/a.txt/x"), (e) => code(e) === "not_a_directory");
});

test("rejects invalid input", async () => {
  for (const bad of [undefined, null, 5, "", "relative/path", "/a\0b", "/" + "a".repeat(5000)]) {
    await assert.rejects(resolvePath(root, bad), (e) => code(e) === "invalid_path", String(bad).slice(0, 20));
  }
});

test("path helpers", () => {
  assert.equal(toReal("/host", "/"), "/host");
  assert.equal(toReal("/host/", "/etc"), "/host/etc");
  assert.equal(toReal("/", "/etc"), "/etc");
  assert.equal(toReal("/", "/"), "/");
  assert.equal(isWithin("/home/ashvin", "/home/ashvin"), true);
  assert.equal(isWithin("/home/ashvin/x", "/home/ashvin"), true);
  assert.equal(isWithin("/home/ashvinx", "/home/ashvin"), false); // prefix trap
  assert.equal(isWithin("/anything", "/"), true);
  assert.equal(parentOf("/"), null);
  assert.equal(parentOf("/home"), "/");
  assert.equal(parentOf("/home/ashvin"), "/home");
  assert.equal(joinVirtual("/", "etc"), "/etc");
  assert.equal(joinVirtual("/etc", "hosts"), "/etc/hosts");
});

test("toFsError maps errno codes and passes FsError through", () => {
  const e = (c: string) => Object.assign(new Error(c), { code: c });
  assert.equal(toFsError(e("ENOENT")).status, 404);
  assert.equal(toFsError(e("EACCES")).code, "permission_denied");
  assert.equal(toFsError(e("EROFS")).code, "read_only");
  assert.equal(toFsError(e("ENOTDIR")).code, "not_a_directory");
  assert.equal(toFsError(e("ENAMETOOLONG")).status, 400);
  assert.equal(toFsError(e("EISDIR")).code, "is_a_directory");
  const own = new FsError(418, "x", "y");
  assert.equal(toFsError(own), own);
  const log = console.error;
  console.error = () => {};
  try {
    assert.equal(toFsError(e("EWEIRD")).status, 500);
  } finally {
    console.error = log;
  }
});
