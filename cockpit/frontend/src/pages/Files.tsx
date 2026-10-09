import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ToastProvider, useToasts } from "../components/Toasts";
import { ContextMenu, type MenuItem } from "../components/files/ContextMenu";
import { ConfirmDialog, PromptDialog } from "../components/files/Dialogs";
import { EditorPanel, isDirty, type OpenFile } from "../components/files/EditorPanel";
import { FileIcon } from "../components/files/FileIcon";
import { FileList, type ViewMode } from "../components/files/FileList";
import { FileTree } from "../components/files/FileTree";
import { PropertiesPanel } from "../components/files/PropertiesPanel";
import { useFetch, usePersistentState } from "../hooks";
import { ApiError } from "../lib/api";
import { baseName, breadcrumbs, joinPath, needsSeparator, parentPath, sortEntries, type SortDir, type SortKey } from "../lib/fileUtils";
import {
  createEntry, deleteEntry, downloadUrl, fsInfo, listDir, readFile, renameEntry, searchFiles, uploadFile,
  type FsEntry, type FsInfo, type Listing, type SearchResult,
} from "../lib/files";
import { formatBytes } from "../lib/format";

export function Files() {
  const { data, error, loading } = useFetch(fsInfo, []);
  if (loading) return <p className="text-ck-muted">Loading…</p>;
  if (error || !data) return <p role="alert" className="text-ck-red">Could not load the file explorer: {error}</p>;
  return (
    <ToastProvider>
      <Explorer info={data} />
    </ToastProvider>
  );
}

type Dialog =
  | { kind: "new"; type: "file" | "dir" }
  | { kind: "rename"; entry: FsEntry }
  | { kind: "delete"; entry: FsEntry }
  | { kind: "overwrite"; files: File[] };

const messageOf = (e: unknown, fallback = "Something went wrong") => (e instanceof Error ? e.message : fallback);

export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a name.";
  if (n === "." || n === "..") return "That name isn't allowed.";
  if (n.includes("/")) return "Names can't contain '/'.";
  return null;
}

function Explorer({ info }: { info: FsInfo }) {
  const { notify } = useToasts();
  const [params, setParams] = useSearchParams();
  const cwd = params.get("path") || info.home;

  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const [view, setView] = usePersistentState<ViewMode>("files.view", "list");
  const [sort, setSort] = usePersistentState<{ key: SortKey; dir: SortDir }>("files.sort", { key: "name", dir: "asc" });
  const [showHidden, setShowHidden] = usePersistentState("files.hidden", false);
  const [treeCollapsed, setTreeCollapsed] = usePersistentState("files.treeCollapsed", false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [editorMode, setEditorMode] = usePersistentState<"preview" | "fullscreen">("files.editorMode", "preview");

  const [menu, setMenu] = useState<{ x: number; y: number; entry: FsEntry | null } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [properties, setProperties] = useState<FsEntry | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // ── Load the current folder ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listDir(cwd)
      .then((l) => {
        if (cancelled) return;
        setListing(l);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setListing(null);
        setError(messageOf(e, "Could not open this folder"));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, version]);

  useEffect(() => {
    setSelected(null);
    setQuery("");
  }, [cwd]);

  // ── Search (debounced, scoped to the current folder) ──
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchFiles(cwd, q)
        .then((r) => !cancelled && setResults(r))
        .catch((e: unknown) => {
          if (cancelled) return;
          setResults({ results: [], truncated: false });
          notify("err", messageOf(e, "Search failed"));
        })
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, cwd, notify]);

  // ── Warn before losing unsaved edits ──
  const anyDirty = openFiles.some(isDirty);
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [anyDirty]);

  const entries = useMemo(() => {
    const visible = (listing?.entries ?? []).filter((e) => showHidden || !e.name.startsWith("."));
    return sortEntries(visible, sort.key, sort.dir);
  }, [listing, showHidden, sort]);

  const cwdDirs = useMemo(() => (listing ? listing.entries.filter((e) => e.kind === "dir").map((e) => e.name) : null), [listing]);
  const selectedEntry = entries.find((e) => e.path === selected) ?? null;
  const writable = listing?.writable ?? false;
  const inTrash = cwd === info.trashDir || cwd.startsWith(info.trashDir + "/");

  const navigate = useCallback((path: string) => setParams({ path }), [setParams]);

  // ── Open files ──
  async function openFile(path: string) {
    const existing = openFiles.find((f) => f.path === path);
    if (existing) return setActivePath(existing.path);
    try {
      const f = await readFile(path);
      const blocked = f.binary ? "binary" : f.tooLarge ? "tooLarge" : undefined;
      const text = f.content ?? "";
      setOpenFiles((files) => (files.some((x) => x.path === f.path) ? files : [...files, { path: f.path, name: f.name, saved: text, draft: text, etag: f.etag, writable: f.writable, size: f.size, blocked }]));
      setActivePath(f.path);
    } catch (e) {
      notify("err", messageOf(e, "Could not open the file"));
    }
  }

  function openEntry(entry: FsEntry) {
    if (entry.kind === "dir") navigate(entry.targetPath ?? entry.path);
    else if (entry.kind === "file") void openFile(entry.path);
    else notify("err", entry.broken ? "This link points to something that doesn't exist." : "This kind of file can't be opened.");
  }

  const updateFile = useCallback((path: string, patch: Partial<OpenFile>) => setOpenFiles((fs) => fs.map((f) => (f.path === path ? { ...f, ...patch } : f))), []);

  function closeFile(path: string) {
    setOpenFiles((fs) => {
      const i = fs.findIndex((f) => f.path === path);
      const rest = fs.filter((f) => f.path !== path);
      setActivePath((cur) => (cur !== path ? cur : (rest[Math.min(i, rest.length - 1)]?.path ?? null)));
      return rest;
    });
  }

  function closeUnder(path: string) {
    const under = (p: string) => p === path || p.startsWith(path + "/");
    setOpenFiles((fs) => fs.filter((f) => !under(f.path)));
    setActivePath((cur) => (cur && under(cur) ? null : cur));
  }

  function remapOpen(from: string, to: string) {
    const map = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p);
    setOpenFiles((fs) => fs.map((f) => (map(f.path) === f.path ? f : { ...f, path: map(f.path), name: baseName(map(f.path)) })));
    setActivePath((cur) => (cur ? map(cur) : cur));
  }

  // ── Actions ──
  async function doCreate(type: "file" | "dir", name: string) {
    const entry = await createEntry(cwd, name.trim(), type);
    notify("ok", `Created ${entry.name}`);
    refresh();
    setSelected(entry.path);
    if (type === "file") void openFile(entry.path);
  }

  async function doRename(entry: FsEntry, name: string) {
    const to = joinPath(parentPath(entry.path), name.trim());
    await renameEntry(entry.path, to);
    remapOpen(entry.path, to);
    notify("ok", `Renamed to ${name.trim()}`);
    refresh();
    setSelected(to);
  }

  async function doDelete(entry: FsEntry) {
    const res = await deleteEntry(entry.path);
    closeUnder(entry.path);
    notify("ok", res.permanent ? `Deleted ${entry.name} permanently` : `Moved ${entry.name} to trash`);
    refresh();
    setSelected(null);
  }

  function download(entry: FsEntry) {
    const a = document.createElement("a");
    a.href = downloadUrl(entry.path);
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      notify("ok", "Path copied");
    } catch {
      notify("err", "Couldn't copy. Your browser blocked clipboard access.");
    }
  }

  async function uploadAll(files: File[], overwrite = false) {
    if (!writable) return notify("err", "This folder is read-only.");
    const conflicts: File[] = [];
    let done = 0;
    for (const file of files) {
      if (file.size > info.maxUploadBytes) {
        notify("err", `${file.name} is larger than ${formatBytes(info.maxUploadBytes)}.`);
        continue;
      }
      try {
        await uploadFile(cwd, file, overwrite);
        done++;
      } catch (e) {
        if (e instanceof ApiError && e.code === "exists") conflicts.push(file);
        else notify("err", `${file.name}: ${messageOf(e)}`);
      }
    }
    if (done > 0) {
      notify("ok", done === 1 ? "Uploaded 1 file" : `Uploaded ${done} files`);
      refresh();
    }
    if (conflicts.length > 0) setDialog({ kind: "overwrite", files: conflicts });
  }

  // ── Drag and drop ──
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(true);
  }
  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    void uploadAll([...e.dataTransfer.files]);
  }

  // ── Context menu ──
  function menuItems(entry: FsEntry | null): MenuItem[] {
    if (!entry) {
      return [
        { label: "New file", onSelect: () => setDialog({ kind: "new", type: "file" }), disabled: !writable },
        { label: "New folder", onSelect: () => setDialog({ kind: "new", type: "dir" }), disabled: !writable },
        { label: "Upload files…", onSelect: () => fileInput.current?.click(), disabled: !writable },
        { label: "Refresh", onSelect: refresh, separator: true },
        { label: "Copy folder path", onSelect: () => void copyPath(cwd) },
      ];
    }
    return [
      { label: "Open", onSelect: () => openEntry(entry), hint: "Enter" },
      { label: "Download", onSelect: () => download(entry), disabled: entry.kind !== "file" },
      { label: "Rename", onSelect: () => setDialog({ kind: "rename", entry }), disabled: !entry.writable, hint: "F2", separator: true },
      { label: inTrash ? "Delete permanently" : "Move to trash", onSelect: () => setDialog({ kind: "delete", entry }), disabled: !entry.writable, danger: true, hint: "Del" },
      { label: "Copy path", onSelect: () => void copyPath(entry.path), separator: true },
      { label: "Properties", onSelect: () => setProperties(entry) },
    ];
  }

  function onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, .monaco-editor, [role=dialog]")) return;
    if (!selectedEntry) return;
    if (e.key === "F2" && selectedEntry.writable) setDialog({ kind: "rename", entry: selectedEntry });
    else if (e.key === "Delete" && selectedEntry.writable) setDialog({ kind: "delete", entry: selectedEntry });
    else return;
    e.preventDefault();
  }

  const crumbs = breadcrumbs(cwd);
  const btn = "rounded-lg border border-ck-border px-2.5 py-1.5 text-sm text-ck-muted transition hover:bg-ck-raised hover:text-ck-text disabled:cursor-not-allowed disabled:opacity-40";
  const showEditor = openFiles.length > 0;
  const fullscreen = showEditor && editorMode === "fullscreen";

  return (
    <div onKeyDown={onKeyDown} className="flex h-[calc(100vh-4rem)] min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-ck-border bg-ck-surface shadow-lg shadow-black/20 lg:flex-row">
      <aside className={`hidden shrink-0 border-r border-ck-border transition-[width] lg:block ${treeCollapsed ? "lg:w-11" : "lg:w-56"} ${fullscreen ? "lg:hidden" : ""}`}>
        {treeCollapsed ? (
          <div className="flex h-full flex-col items-center gap-2 p-2">
            <button onClick={() => setTreeCollapsed(false)} aria-label="Expand folder tree" title="Expand folder tree" className="flex h-8 w-8 items-center justify-center rounded-lg text-ck-muted transition hover:bg-ck-raised hover:text-ck-text">▶</button>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex justify-end px-2 pt-2">
              <button onClick={() => setTreeCollapsed(true)} aria-label="Collapse folder tree" title="Collapse folder tree" className="flex h-6 w-6 items-center justify-center rounded text-ck-muted transition hover:bg-ck-raised hover:text-ck-text">◀</button>
            </div>
            <FileTree cwd={cwd} home={info.home} showHidden={showHidden} version={version} cwdDirs={cwdDirs} onNavigate={navigate} />
          </div>
        )}
      </aside>

      <section
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${fullscreen ? "hidden lg:hidden" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={onDrop}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border p-3">
          <button className={btn} onClick={() => navigate(parentPath(cwd))} disabled={cwd === "/"} aria-label="Go to parent folder" title="Up one level">↑</button>
          <nav aria-label="Breadcrumb" className="scrollbar-thin flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex shrink-0 items-center">
                {needsSeparator(crumbs, i) && <span aria-hidden className="px-0.5 text-ck-muted">/</span>}
                <button onClick={() => navigate(c.path)} aria-current={i === crumbs.length - 1 ? "page" : undefined} className={`rounded-md px-1.5 py-0.5 transition hover:bg-ck-raised ${i === crumbs.length - 1 ? "font-medium text-ck-text" : "text-ck-muted"}`}>
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in this folder"
            aria-label="Search files"
            className="w-44 rounded-lg border border-ck-border bg-ck-raised px-3 py-1.5 text-sm text-ck-text outline-none placeholder:text-ck-muted focus:border-ck-accent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-ck-border px-3 py-2">
          <button className={btn} disabled={!writable} onClick={() => setDialog({ kind: "new", type: "file" })} title={writable ? "New file" : "This folder is read-only"}>+ File</button>
          <button className={btn} disabled={!writable} onClick={() => setDialog({ kind: "new", type: "dir" })} title={writable ? "New folder" : "This folder is read-only"}>+ Folder</button>
          <button className={btn} disabled={!writable} onClick={() => fileInput.current?.click()} title={writable ? "Upload files" : "This folder is read-only"}>Upload</button>
          <input ref={fileInput} type="file" multiple hidden aria-label="Upload files" onChange={(e) => { void uploadAll([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <button className={btn} onClick={refresh} aria-label="Refresh" title="Refresh">⟳</button>
          <span className="ml-auto flex items-center gap-2">
            <button className={btn} onClick={() => setShowHidden(!showHidden)} aria-pressed={showHidden} title="Show hidden files">{showHidden ? "Hide dotfiles" : "Show dotfiles"}</button>
            <span role="group" aria-label="View" className="flex overflow-hidden rounded-lg border border-ck-border text-sm">
              {(["list", "grid"] as const).map((m) => (
                <button key={m} onClick={() => setView(m)} aria-pressed={view === m} className={`px-2.5 py-1.5 transition ${view === m ? "bg-ck-accent text-ck-bg" : "text-ck-muted hover:text-ck-text"}`}>
                  {m === "list" ? "List" : "Grid"}
                </button>
              ))}
            </span>
          </span>
        </div>

        {listing && !writable && (
          <p role="note" className="border-b border-ck-border bg-ck-amber/10 px-4 py-2 text-xs text-ck-amber">
            🔒 Read-only location. You can browse, open and download files here. Editing outside your home folder needs a write unlock, which isn&apos;t available yet.
          </p>
        )}

        {/* Body */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          onContextMenu={(e) => {
            e.preventDefault();
            const row = (e.target as HTMLElement).closest<HTMLElement>("[role=option]");
            const entry = row ? (entries.find((x) => `fe-${x.path}` === row.id) ?? null) : null;
            if (entry) setSelected(entry.path);
            setMenu({ x: e.clientX, y: e.clientY, entry });
          }}
        >
          {query.trim() ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Search results">
              {searching && !results && <p className="p-6 text-center text-sm text-ck-muted">Searching…</p>}
              {results && results.results.length === 0 && <p className="p-6 text-center text-sm text-ck-muted">No matches for “{query.trim()}”.</p>}
              <ul>
                {results?.results.map((r) => (
                  <li key={r.path}>
                    <button
                      onClick={() => (r.kind === "dir" ? navigate(r.path) : void openFile(r.path))}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ck-raised"
                    >
                      <FileIcon entry={{ name: r.name, path: r.path, kind: r.kind, size: 0, mtimeMs: 0, mode: 0, isSymlink: false, writable: false }} />
                      <span className="min-w-0">
                        <span className="block truncate">{r.name}</span>
                        <span className="block truncate text-xs text-ck-muted">{parentPath(r.path)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {results?.truncated && <p className="p-3 text-center text-xs text-ck-muted">Showing the first matches. Narrow your search to see more.</p>}
            </div>
          ) : loading && !listing ? (
            <p className="p-8 text-center text-sm text-ck-muted">Loading…</p>
          ) : error ? (
            <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-ck-red">{error}</p>
              <div className="flex gap-2">
                <button className={btn} onClick={() => navigate(parentPath(cwd))} disabled={cwd === "/"}>Go up</button>
                <button className={btn} onClick={() => navigate(info.home)}>Go home</button>
              </div>
            </div>
          ) : (
            <FileList
              entries={entries}
              view={view}
              selected={selected}
              sortKey={sort.key}
              sortDir={sort.dir}
              onSort={(key) => setSort({ key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" })}
              onSelect={setSelected}
              onOpen={openEntry}
              onUp={() => cwd !== "/" && navigate(parentPath(cwd))}
              empty={listing && listing.entries.length > 0 ? "Only hidden files here. Use “Show dotfiles” to see them." : "This folder is empty."}
            />
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-ck-border px-4 py-1.5 text-xs text-ck-muted">
          <span>{entries.length} {entries.length === 1 ? "item" : "items"}</span>
          {listing?.truncated && <span className="text-ck-amber">Showing the first 5,000 items</span>}
          {selectedEntry && <span className="truncate">{selectedEntry.name}{selectedEntry.kind === "file" ? ` · ${formatBytes(selectedEntry.size)}` : ""}</span>}
          {inTrash && <span className="ml-auto">Trash: items here are deleted permanently</span>}
        </footer>

        {dragging && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-ck-accent bg-ck-bg/80 text-lg text-ck-accent">
            {writable ? "Drop files to upload here" : "This folder is read-only"}
          </div>
        )}
      </section>

      {showEditor && (
        <section
          aria-label="Editor"
          className={
            fullscreen
              ? "fixed inset-0 z-40 flex flex-col bg-ck-bg"
              : "flex min-h-0 min-w-0 flex-1 flex-col border-t border-ck-border lg:flex-[1.3] lg:border-l lg:border-t-0"
          }
        >
          <EditorPanel
            files={openFiles}
            activePath={activePath}
            mode={editorMode}
            onModeChange={setEditorMode}
            onActivate={setActivePath}
            onClose={closeFile}
            onUpdate={updateFile}
            onSaved={(p) => {
              notify("ok", `Saved ${baseName(p)}`);
              if (parentPath(p) === cwd) refresh();
            }}
          />
        </section>
      )}

      {properties && <PropertiesPanel entry={properties} onClose={() => setProperties(null)} />}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.entry)} onClose={() => setMenu(null)} />}

      {dialog?.kind === "new" && (
        <PromptDialog
          title={dialog.type === "file" ? "New file" : "New folder"}
          label="Name"
          submitLabel="Create"
          validate={validateName}
          onSubmit={(name) => doCreate(dialog.type, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rename" && (
        <PromptDialog title="Rename" label="New name" initial={dialog.entry.name} submitLabel="Rename" validate={validateName} onSubmit={(name) => doRename(dialog.entry, name)} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={inTrash ? "Delete permanently?" : "Move to trash?"}
          message={inTrash ? `“${dialog.entry.name}” will be deleted for good. This can't be undone.` : `“${dialog.entry.name}” will be moved to the trash. You can restore it from the Trash folder.`}
          confirmLabel={inTrash ? "Delete permanently" : "Move to trash"}
          danger
          onConfirm={() => doDelete(dialog.entry)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "overwrite" && (
        <ConfirmDialog
          title="Replace existing files?"
          message={`${dialog.files.map((f) => f.name).join(", ")} already ${dialog.files.length === 1 ? "exists" : "exist"} in this folder.`}
          confirmLabel="Replace"
          danger
          onConfirm={() => uploadAll(dialog.files, true)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
