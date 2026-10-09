import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Files, validateName } from "../src/pages/Files";
import { json, mockApi } from "./helpers";

// Monaco cannot run in jsdom: stand in a textarea with the same props.
vi.mock("../src/components/files/Editor", () => ({
  Editor: (p: { name: string; value: string; readOnly: boolean; onChange: (v: string) => void; onSave: () => void }) => (
    <div>
      <textarea aria-label={`editor ${p.name}`} value={p.value} readOnly={p.readOnly} onChange={(e) => p.onChange(e.target.value)} />
      <button onClick={p.onSave}>stub-save</button>
    </div>
  ),
}));

const INFO = { home: "/home/a", trashDir: "/home/a/.local/share/Trash", maxEditBytes: 5_000_000, maxUploadBytes: 1_000_000 };
const ent = (name: string, o: Record<string, unknown> = {}) => ({
  name, path: `/home/a/${name}`, kind: "file", size: 5, mtimeMs: 1_700_000_000_000, mode: 0o644, isSymlink: false, writable: true, ...o,
});
const listing = (entries: unknown[], o: Record<string, unknown> = {}) => json({ path: "/home/a", parent: "/home", writable: true, truncated: false, entries, ...o });
const FILE = { path: "/home/a/n.txt", name: "n.txt", size: 5, mtimeMs: 1, etag: "e1", mode: 0o644, writable: true, binary: false, tooLarge: false, content: "hello" };

function mount(routes: Parameters<typeof mockApi>[0], url = "/files") {
  return mockApi({ "/fs/info": () => json(INFO), ...routes });
  void url;
}
const renderAt = (url = "/files") => render(<MemoryRouter initialEntries={[url]}><Files /></MemoryRouter>);
const calls = (f: ReturnType<typeof mockApi>, method: string, part: string) => f.mock.calls.filter(([u, i]) => String(u).includes(part) && ((i as RequestInit | undefined)?.method ?? "GET") === method);

beforeEach(() => window.localStorage.clear());

describe("validateName", () => {
  it("accepts normal names and rejects blank, dots and slashes", () => {
    expect(validateName("a.txt")).toBeNull();
    expect(validateName("  ")).toMatch(/Enter a name/);
    expect(validateName("..")).toMatch(/isn't allowed/);
    expect(validateName("a/b")).toMatch(/'\/'/);
  });
});

describe("Files page", () => {
  it("lists the home folder, hides dotfiles by default, and can reveal them", async () => {
    mount({ "/fs/list": () => listing([ent("n.txt"), ent(".hidden"), ent("docs", { kind: "dir", size: 0 })]) });
    renderAt();
    expect(await screen.findByRole("option", { name: /n\.txt/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /docs/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /\.hidden/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show dotfiles" }));
    expect(await screen.findByRole("option", { name: /\.hidden/ })).toBeInTheDocument();
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it("shows an error with recovery actions when a folder cannot be opened", async () => {
    mount({ "/fs/list": () => json({ error: "Permission denied" }, 403) });
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(screen.getByRole("button", { name: "Go home" })).toBeInTheDocument();
  });

  it("explains an empty folder and a folder of only hidden files", async () => {
    mount({ "/fs/list": () => listing([]) });
    const { unmount } = renderAt();
    expect(await screen.findByText("This folder is empty.")).toBeInTheDocument();
    unmount();
    mount({ "/fs/list": () => listing([ent(".only")]) });
    renderAt();
    expect(await screen.findByText(/Only hidden files here/)).toBeInTheDocument();
  });

  it("marks read-only locations and disables creating and uploading", async () => {
    mount({ "/fs/list": () => listing([ent("hosts", { writable: false })], { path: "/etc", writable: false }) });
    renderAt("/files?path=/etc");
    expect(await screen.findByRole("note")).toHaveTextContent(/Read-only location/);
    for (const name of ["+ File", "+ Folder", "Upload"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  });

  it("opens a file, tracks unsaved edits, and saves with the etag", async () => {
    const f = mount({
      "/fs/list": () => listing([ent("n.txt")]),
      "/fs/read": () => json(FILE),
      "/fs/write": () => json({ etag: "e2", size: 9, mtimeMs: 2 }),
    });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    const editor = await screen.findByLabelText("editor n.txt");
    expect(screen.getByRole("tab", { name: "n.txt" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Unsaved changes")).toBeNull();

    fireEvent.change(editor, { target: { value: "hello world" } });
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByLabelText("Unsaved changes")).toBeNull());
    expect(JSON.parse((calls(f, "PUT", "/fs/write")[0][1] as RequestInit).body as string)).toEqual({ path: "/home/a/n.txt", content: "hello world", etag: "e1" });
    expect(await screen.findByText("Saved n.txt")).toBeInTheDocument();

    // a second save must use the NEW etag, not the one from when the file was opened
    fireEvent.change(editor, { target: { value: "again" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls(f, "PUT", "/fs/write")).toHaveLength(2));
    expect(JSON.parse((calls(f, "PUT", "/fs/write")[1][1] as RequestInit).body as string).etag).toBe("e2");
  });

  it("offers to overwrite or reload on a save conflict", async () => {
    const f = mount({
      "/fs/list": () => listing([ent("n.txt")]),
      "/fs/read": () => json(FILE),
      "/fs/write": (init) => (JSON.parse(init!.body as string).etag ? json({ error: "changed", code: "conflict" }, 409) : json({ etag: "e9", size: 1, mtimeMs: 3 })),
    });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.change(await screen.findByLabelText("editor n.txt"), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/changed on disk/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Overwrite with my version" }));
    await waitFor(() => expect(screen.queryByText(/changed on disk/)).toBeNull());
    expect(JSON.parse((calls(f, "PUT", "/fs/write")[1][1] as RequestInit).body as string).etag).toBeUndefined();
  });

  it("reloads from disk when discarding my version after a conflict", async () => {
    let reads = 0;
    mount({
      "/fs/list": () => listing([ent("n.txt")]),
      "/fs/read": () => json(++reads === 1 ? FILE : { ...FILE, content: "from disk", etag: "e5" }),
      "/fs/write": () => json({ error: "changed", code: "conflict" }, 409),
    });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.change(await screen.findByLabelText("editor n.txt"), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard mine and reload" }));
    await waitFor(() => expect((screen.getByLabelText("editor n.txt") as HTMLTextAreaElement).value).toBe("from disk"));
  });

  it("shows save failures inline", async () => {
    mount({ "/fs/list": () => listing([ent("n.txt")]), "/fs/read": () => json(FILE), "/fs/write": () => json({ error: "Permission denied", code: "permission_denied" }, 403) });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.change(await screen.findByLabelText("editor n.txt"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findAllByRole("alert")).some((a) => a.textContent === "Permission denied")).toBe(true);
  });

  it("opens read-only files without a Save button, and blocks binary and oversized files", async () => {
    let which = "ro";
    mount({
      "/fs/list": () => listing([ent("ro.txt"), ent("b.bin"), ent("big.txt")]),
      "/fs/read": () => json(which === "ro" ? { ...FILE, name: "ro.txt", path: "/home/a/ro.txt", writable: false } : which === "bin" ? { ...FILE, name: "b.bin", path: "/home/a/b.bin", binary: true, content: null } : { ...FILE, name: "big.txt", path: "/home/a/big.txt", tooLarge: true, size: 9_000_000, content: null }),
    });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /ro\.txt/ }));
    expect(await screen.findByText("Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    which = "bin";
    fireEvent.doubleClick(screen.getByRole("option", { name: /b\.bin/ }));
    expect(await screen.findByText(/binary file/)).toBeInTheDocument();
    which = "big";
    fireEvent.doubleClick(screen.getByRole("option", { name: /big\.txt/ }));
    expect(await screen.findByText(/too large to edit/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Download" })[0]).toHaveAttribute("href", expect.stringContaining("/api/fs/download?path="));
  });

  it("asks before closing a tab with unsaved changes", async () => {
    mount({ "/fs/list": () => listing([ent("n.txt")]), "/fs/read": () => json(FILE) });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.change(await screen.findByLabelText("editor n.txt"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Close n.txt" }));
    const dlg = screen.getByRole("dialog", { name: "Unsaved changes" });
    fireEvent.click(within(dlg).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("tab", { name: "n.txt" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close n.txt" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "n.txt" })).toBeNull());
  });

  it("creates a file and opens it, and refuses an invalid name before calling the API", async () => {
    const f = mount({
      "/fs/list": () => listing([]),
      "/fs/create": () => json(ent("new.txt"), 201),
      "/fs/read": () => json({ ...FILE, name: "new.txt", path: "/home/a/new.txt", content: "" }),
    });
    renderAt();
    await screen.findByText("This folder is empty."); // the button stays disabled until the listing loads
    fireEvent.click(screen.getByRole("button", { name: "+ File" }));
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "a/b" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent(/'\/'/);
    expect(calls(f, "POST", "/fs/create")).toHaveLength(0);
    fireEvent.change(input, { target: { value: "new.txt" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("tab", { name: "new.txt" })).toBeInTheDocument();
    expect(JSON.parse((calls(f, "POST", "/fs/create")[0][1] as RequestInit).body as string)).toEqual({ dir: "/home/a", name: "new.txt", type: "file" });
  });

  it("creates a folder without opening a tab", async () => {
    mount({ "/fs/list": () => listing([]), "/fs/create": () => json(ent("sub", { kind: "dir" }), 201) });
    renderAt();
    await screen.findByText("This folder is empty.");
    fireEvent.click(screen.getByRole("button", { name: "+ Folder" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "sub" } });
    fireEvent.submit(screen.getByLabelText("Name").closest("form")!);
    expect(await screen.findByText("Created sub")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("renames via F2 and keeps an open tab in sync", async () => {
    const f = mount({
      "/fs/list": () => listing([ent("n.txt")]),
      "/fs/read": () => json(FILE),
      "/fs/rename": () => json(ent("m.txt")),
    });
    renderAt();
    const row = await screen.findByRole("option", { name: /n\.txt/ });
    fireEvent.doubleClick(row);
    await screen.findByRole("tab", { name: "n.txt" });
    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "F2" });
    const input = await screen.findByLabelText("New name");
    fireEvent.change(input, { target: { value: "m.txt" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("tab", { name: "m.txt" })).toBeInTheDocument();
    expect(JSON.parse((calls(f, "POST", "/fs/rename")[0][1] as RequestInit).body as string)).toEqual({ from: "/home/a/n.txt", to: "/home/a/m.txt" });
  });

  it("moves to trash only after confirmation and closes the file's tab", async () => {
    const f = mount({
      "/fs/list": () => listing([ent("n.txt")]),
      "/fs/read": () => json(FILE),
      "/fs/delete": () => json({ trashed: true, permanent: false, name: "n.txt" }),
    });
    renderAt();
    const row = await screen.findByRole("option", { name: /n\.txt/ });
    fireEvent.doubleClick(row);
    await screen.findByRole("tab", { name: "n.txt" });
    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Delete" });
    const dlg = await screen.findByRole("dialog", { name: "Move to trash?" });
    expect(calls(f, "POST", "/fs/delete")).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole("button", { name: "Move to trash" }));
    expect(await screen.findByText("Moved n.txt to trash")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "n.txt" })).toBeNull();
  });

  it("uses permanent-delete wording inside the trash", async () => {
    mount({ "/fs/list": () => listing([ent("old.txt")], { path: INFO.trashDir + "/files" }) });
    renderAt(`/files?path=${encodeURIComponent(INFO.trashDir + "/files")}`);
    const row = await screen.findByRole("option", { name: /old\.txt/ });
    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Delete" });
    expect(await screen.findByRole("dialog", { name: "Delete permanently?" })).toBeInTheDocument();
    expect(screen.getByText(/deleted permanently/)).toBeInTheDocument();
  });

  it("ignores shortcuts for read-only entries", async () => {
    mount({ "/fs/list": () => listing([ent("hosts", { writable: false })], { path: "/etc", writable: false }) });
    renderAt("/files?path=/etc");
    fireEvent.click(await screen.findByRole("option", { name: /hosts/ }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "F2" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Delete" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uploads picked files, then asks before replacing ones that already exist", async () => {
    let attempt = 0;
    const f = mount({
      "/fs/list": () => listing([]),
      "/fs/upload": (init, url) => {
        attempt++;
        const overwrite = String(url).includes("overwrite=1");
        return attempt === 1 && !overwrite ? json({ error: "exists", code: "exists" }, 409) : json(ent("a.txt"), 201);
      },
    });
    renderAt();
    await screen.findByText("This folder is empty.");
    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt")] } });
    const dlg = await screen.findByRole("dialog", { name: "Replace existing files?" });
    expect(calls(f, "PUT", "overwrite=1")).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(calls(f, "PUT", "overwrite=1")).toHaveLength(1));
    expect(await screen.findByText("Uploaded 1 file")).toBeInTheDocument();
  });

  it("rejects oversized uploads client-side and shows server upload errors", async () => {
    const f = mount({ "/fs/list": () => listing([]), "/fs/upload": () => json({ error: "disk full", code: "internal" }, 500) });
    renderAt();
    await screen.findByText("This folder is empty.");
    const input = screen.getByLabelText("Upload files");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(2_000_000)], "big.bin")] } });
    expect(await screen.findByText(/larger than/)).toBeInTheDocument();
    expect(calls(f, "PUT", "/fs/upload")).toHaveLength(0);
    fireEvent.change(input, { target: { files: [new File(["x"], "ok.txt")] } });
    expect(await screen.findByText(/ok\.txt: disk full/)).toBeInTheDocument();
  });

  it("handles drag and drop onto the folder, and refuses drops on read-only folders", async () => {
    const f = mount({ "/fs/list": () => listing([]), "/fs/upload": () => json(ent("d.txt"), 201) });
    const { container, unmount } = renderAt();
    await screen.findByText("This folder is empty.");
    const zone = container.querySelector("section.relative")!;
    const dt = { types: ["Files"], files: [new File(["x"], "d.txt")] };
    fireEvent.dragOver(zone, { dataTransfer: dt });
    expect(screen.getByText("Drop files to upload here")).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: dt });
    expect(await screen.findByText("Uploaded 1 file")).toBeInTheDocument();
    expect(calls(f, "PUT", "/fs/upload")).toHaveLength(1);
    unmount();

    mount({ "/fs/list": () => listing([], { path: "/etc", writable: false }) });
    const r2 = renderAt("/files?path=/etc");
    await screen.findByRole("note");
    fireEvent.drop(r2.container.querySelector("section.relative")!, { dataTransfer: dt });
    expect(await screen.findByText("This folder is read-only.")).toBeInTheDocument();
  });

  it("ignores drags that are not files", async () => {
    mount({ "/fs/list": () => listing([]) });
    const { container } = renderAt();
    await screen.findByText("This folder is empty.");
    fireEvent.dragOver(container.querySelector("section.relative")!, { dataTransfer: { types: ["text/plain"], files: [] } });
    expect(screen.queryByText("Drop files to upload here")).toBeNull();
  });

  it("searches the current folder, opens a result, and reports no matches", async () => {
    mount({
      "/fs/list": () => listing([ent("n.txt")]),
      "/fs/search": (_i, url) => (String(url).includes("q=zzz") ? json({ results: [], truncated: false }) : json({ results: [{ name: "n.txt", path: "/home/a/deep/n.txt", kind: "file" }], truncated: true })),
      "/fs/read": () => json(FILE),
    });
    renderAt();
    await screen.findByRole("option", { name: /n\.txt/ });
    const box = screen.getByLabelText("Search files");
    fireEvent.change(box, { target: { value: "n.t" } });
    const res = await screen.findByRole("button", { name: /n\.txt.*\/home\/a\/deep/ }, { timeout: 3000 });
    expect(screen.getByText(/Showing the first matches/)).toBeInTheDocument();
    fireEvent.click(res);
    expect(await screen.findByRole("tab", { name: "n.txt" })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(await screen.findByText(/No matches for/, undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "" } });
    expect(await screen.findByRole("option", { name: /n\.txt/ })).toBeInTheDocument();
  });

  it("navigates into folders, breadcrumbs, and up", async () => {
    mount({
      "/fs/list": (_i, url) => (String(url).includes("docs") ? listing([ent("inner.txt", { path: "/home/a/docs/inner.txt" })], { path: "/home/a/docs", parent: "/home/a" }) : listing([ent("docs", { kind: "dir", size: 0 })])),
    });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /docs/ }));
    expect(await screen.findByRole("option", { name: /inner\.txt/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to parent folder" }));
    expect(await screen.findByRole("option", { name: /docs/ })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "home" }));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("home"));
  });

  it("persists view and sort preferences", async () => {
    mount({ "/fs/list": () => listing([ent("a.txt")]) });
    renderAt();
    await screen.findByRole("option", { name: /a\.txt/ });
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(window.localStorage.getItem("cockpit.files.view")).toBe('"grid"');
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sorts when a column header is clicked", async () => {
    mount({ "/fs/list": () => listing([ent("a.txt", { size: 1 }), ent("b.txt", { size: 99 })]) });
    renderAt();
    await screen.findByRole("option", { name: /a\.txt/ });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Size" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Size" }));
    expect(window.localStorage.getItem("cockpit.files.sort")).toBe('{"key":"size","dir":"desc"}');
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("b.txt");
  });

  it("opens the context menu on a file and on empty space, and copies the path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mount({ "/fs/list": () => listing([ent("n.txt")]) });
    renderAt();
    const row = await screen.findByRole("option", { name: /n\.txt/ });
    fireEvent.contextMenu(row);
    expect(screen.getByRole("menuitem", { name: /Rename/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy path" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/home/a/n.txt"));
    fireEvent.contextMenu(screen.getByRole("listbox"));
    expect(screen.getByRole("menuitem", { name: "New folder" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy folder path" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("/home/a"));
  });

  it("tells the user when copying is blocked, and when an entry cannot be opened", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    mount({ "/fs/list": () => listing([ent("n.txt"), ent("sock", { kind: "other" }), ent("dead", { kind: "other", broken: true, isSymlink: true })]) });
    renderAt();
    fireEvent.contextMenu(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy path" }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByRole("option", { name: /dead/ }));
    expect(await screen.findByText(/doesn't exist/)).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByRole("option", { name: /sock/ }));
    expect(await screen.findByText(/can't be opened/)).toBeInTheDocument();
  });

  it("shows an error when the explorer cannot start", async () => {
    mockApi({ "/fs/info": () => json({ error: "down" }, 500) });
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent(/down/);
  });

  it("warns before the page unloads while there are unsaved edits", async () => {
    mount({ "/fs/list": () => listing([ent("n.txt")]), "/fs/read": () => json(FILE) });
    renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.change(await screen.findByLabelText("editor n.txt"), { target: { value: "x" } });
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("switches the editor between the side preview and fullscreen, and remembers the choice", async () => {
    window.localStorage.clear();
    mount({ "/fs/list": () => listing([ent("n.txt")]), "/fs/read": () => json(FILE) });
    const { container } = renderAt();
    fireEvent.doubleClick(await screen.findByRole("option", { name: /n\.txt/ }));
    await screen.findByLabelText("editor n.txt");
    expect(container.querySelector("section[aria-label=Editor]")).not.toHaveClass("fixed");
    expect(screen.getByRole("option", { name: /n\.txt/ })).toBeInTheDocument(); // the file list is still visible in preview mode

    fireEvent.click(screen.getByRole("button", { name: "Open fullscreen" }));
    expect(window.localStorage.getItem("cockpit.files.editorMode")).toBe('"fullscreen"');
    expect(container.querySelector("section[aria-label=Editor]")).toHaveClass("fixed");
    expect(container.querySelector("section.relative")).toHaveClass("hidden"); // jsdom doesn't apply CSS, so check the class directly

    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(container.querySelector("section[aria-label=Editor]")).not.toHaveClass("fixed");
    expect(screen.getByRole("option", { name: /n\.txt/ })).toBeInTheDocument();
  });

  it("collapses and expands the folder tree", async () => {
    window.localStorage.clear();
    mount({ "/fs/list": () => listing([ent("n.txt")]) });
    renderAt();
    expect(await screen.findByRole("navigation", { name: "Folders" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse folder tree" }));
    expect(window.localStorage.getItem("cockpit.files.treeCollapsed")).toBe("true");
    expect(screen.queryByRole("navigation", { name: "Folders" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand folder tree" }));
    expect(await screen.findByRole("navigation", { name: "Folders" })).toBeInTheDocument();
  });

  it("opens Properties for an entry from its context menu and shows its details", async () => {
    mount({ "/fs/list": () => listing([ent("n.txt", { size: 123 })]) });
    renderAt();
    fireEvent.contextMenu(await screen.findByRole("option", { name: /n\.txt/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Properties" }));
    const panel = await screen.findByRole("complementary", { name: "Properties" });
    expect(panel).toHaveTextContent("n.txt");
    expect(panel).toHaveTextContent("/home/a/n.txt");
    fireEvent.click(screen.getByRole("button", { name: "Close properties" }));
    expect(screen.queryByRole("complementary", { name: "Properties" })).toBeNull();
  });
});
