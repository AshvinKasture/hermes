import { useCallback, useEffect, useState } from "react";
import { ancestors, baseName, joinPath } from "../../lib/fileUtils";
import { listDir } from "../../lib/files";

interface Props {
  cwd: string;
  home: string;
  showHidden: boolean;
  /** Bumps when the listing of `cwd` changes so its children refresh. */
  version: number;
  /** Directory names in the current folder, supplied by the main listing for free. */
  cwdDirs: string[] | null;
  onNavigate: (path: string) => void;
}

/** Lazily loaded directory tree. Only folders are shown. */
export function FileTree({ cwd, home, showHidden, version, cwdDirs, onNavigate }: Props) {
  const [children, setChildren] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["/"]));
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const load = useCallback(async (dir: string) => {
    try {
      const l = await listDir(dir);
      setChildren((c) => ({ ...c, [l.path === dir ? dir : dir]: l.entries.filter((e) => e.kind === "dir").map((e) => e.name) }));
      setFailed((f) => {
        if (!f.has(dir)) return f;
        const n = new Set(f);
        n.delete(dir);
        return n;
      });
    } catch {
      setFailed((f) => new Set(f).add(dir));
      setChildren((c) => ({ ...c, [dir]: [] }));
    }
  }, []);

  // Keep the path to the current folder, and the folder itself, expanded. Ancestors are fetched;
  // the current folder's own children come from the main listing (see below), so no extra request.
  useEffect(() => {
    const chain = ancestors(cwd);
    setExpanded((s) => new Set([...s, ...chain]));
    for (const dir of chain.slice(0, -1)) {
      if (!(dir in children)) void load(dir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  // The main listing already tells us the current folder's sub-folders.
  useEffect(() => {
    if (cwdDirs) setChildren((c) => ({ ...c, [cwd]: cwdDirs }));
  }, [cwd, cwdDirs, version]);

  function toggle(dir: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(dir)) n.delete(dir);
      else {
        n.add(dir);
        if (!(dir in children)) void load(dir);
      }
      return n;
    });
  }

  function node(dir: string, depth: number) {
    const isOpen = expanded.has(dir);
    const kids = (children[dir] ?? []).filter((n) => showHidden || !n.startsWith(".")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const active = dir === cwd;
    return (
      <li key={dir} role="treeitem" aria-expanded={isOpen} aria-selected={active}>
        <div
          className={`group flex items-center rounded-lg pr-2 text-sm transition ${active ? "bg-ck-accent/15 text-ck-accent" : "text-ck-muted hover:bg-ck-raised hover:text-ck-text"}`}
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <button onClick={() => toggle(dir)} aria-label={`${isOpen ? "Collapse" : "Expand"} ${baseName(dir)}`} className="flex h-6 w-5 items-center justify-center text-[10px]">
            <span aria-hidden className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
          </button>
          <button onClick={() => onNavigate(dir)} className="min-w-0 flex-1 truncate py-1 text-left" title={dir}>
            {dir === "/" ? "/ (root)" : baseName(dir)}
          </button>
        </div>
        {isOpen && (
          <ul role="group">
            {failed.has(dir) && <li className="py-1 text-xs text-ck-muted" style={{ paddingLeft: (depth + 1) * 12 + 24 }}>Can&apos;t open</li>}
            {kids.map((k) => node(joinPath(dir, k), depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <nav aria-label="Folders" className="flex h-full min-h-0 flex-col">
      <div className="space-y-0.5 border-b border-ck-border p-2 text-sm">
        <button onClick={() => onNavigate(home)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-ck-text transition hover:bg-ck-raised">
          <span aria-hidden>🏠</span> Home
        </button>
        <button onClick={() => onNavigate(joinPath(home, ".local/share/Trash/files"))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-ck-text transition hover:bg-ck-raised">
          <span aria-hidden>🗑</span> Trash
        </button>
      </div>
      <ul role="tree" aria-label="Folder tree" className="scrollbar-thin min-h-0 flex-1 overflow-auto p-2">
        {node("/", 0)}
      </ul>
    </nav>
  );
}
