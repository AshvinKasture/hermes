import { useEffect, useRef, type KeyboardEvent } from "react";
import { formatBytes } from "../../lib/format";
import { formatDate, type SortDir, type SortKey } from "../../lib/fileUtils";
import type { FsEntry } from "../../lib/files";
import { FileIcon } from "./FileIcon";

export type ViewMode = "list" | "grid";

interface Props {
  entries: FsEntry[];
  view: ViewMode;
  selected: string | null;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelect: (path: string | null) => void;
  onOpen: (entry: FsEntry) => void;
  onUp: () => void;
  empty: string;
}

const COLS = [
  { key: "name" as const, label: "Name", cls: "flex-1 min-w-0" },
  { key: "modified" as const, label: "Modified", cls: "hidden w-40 sm:block" },
  { key: "size" as const, label: "Size", cls: "hidden w-24 text-right md:block" },
];

const idFor = (path: string) => `fe-${path}`;

export function FileList({ entries, view, selected, sortKey, sortDir, onSort, onSelect, onOpen, onUp, empty }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const index = entries.findIndex((e) => e.path === selected);

  useEffect(() => {
    if (!selected) return;
    document.getElementById(idFor(selected))?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  function columns(): number {
    if (view === "list" || !box.current) return 1;
    return Math.max(1, getComputedStyle(box.current).gridTemplateColumns.split(" ").length);
  }

  function move(to: number) {
    if (entries.length === 0) return;
    onSelect(entries[Math.min(entries.length - 1, Math.max(0, to))].path);
  }

  function onKeyDown(e: KeyboardEvent) {
    const cols = columns();
    switch (e.key) {
      case "ArrowDown": move(index < 0 ? 0 : index + cols); break;
      case "ArrowUp": move(index < 0 ? 0 : index - cols); break;
      case "ArrowRight": if (view === "grid") move(index + 1); else return; break;
      case "ArrowLeft": if (view === "grid") move(index - 1); else return; break;
      case "Home": move(0); break;
      case "End": move(entries.length - 1); break;
      case "Enter": if (index >= 0) onOpen(entries[index]); else return; break;
      case "Backspace": onUp(); break;
      case "Escape": onSelect(null); break;
      default: return;
    }
    e.preventDefault();
  }

  const listbox = (
    <div
      ref={box}
      role="listbox"
      aria-label="Files"
      tabIndex={0}
      aria-activedescendant={selected ? idFor(selected) : undefined}
      onKeyDown={onKeyDown}
      onClick={(e) => e.target === e.currentTarget && onSelect(null)}
      className={`min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-1 focus-visible:ring-ck-accent/50 ${
        view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] content-start gap-2 p-3" : "p-1"
      }`}
    >
      {entries.map((e) => {
        const sel = e.path === selected;
        return view === "grid" ? (
          <div
            key={e.path}
            id={idFor(e.path)}
            role="option"
            aria-selected={sel}
            onClick={() => onSelect(e.path)}
            onDoubleClick={() => onOpen(e)}
            className={`flex cursor-default select-none flex-col items-center gap-2 rounded-xl p-3 text-center transition ${sel ? "bg-ck-accent/15 ring-1 ring-ck-accent/40" : "hover:bg-ck-raised"}`}
          >
            <FileIcon entry={e} large />
            <span className="w-full break-words text-xs leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{e.name}</span>
          </div>
        ) : (
          <div
            key={e.path}
            id={idFor(e.path)}
            role="option"
            aria-selected={sel}
            onClick={() => onSelect(e.path)}
            onDoubleClick={() => onOpen(e)}
            className={`flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${sel ? "bg-ck-accent/15 ring-1 ring-ck-accent/40" : "hover:bg-ck-raised"}`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <FileIcon entry={e} />
              <span className="truncate">{e.name}</span>
              {e.isSymlink && e.targetPath && <span className="hidden truncate text-xs text-ck-muted lg:inline">→ {e.targetPath}</span>}
              {!e.writable && <span title="Read-only" className="text-xs text-ck-muted" aria-label="read-only">🔒</span>}
            </span>
            <span className="hidden w-40 text-xs text-ck-muted sm:block">{formatDate(e.mtimeMs)}</span>
            <span className="hidden w-24 text-right text-xs tabular-nums text-ck-muted md:block">{e.kind === "file" ? formatBytes(e.size) : "—"}</span>
          </div>
        );
      })}
      {entries.length === 0 && <p className="col-span-full p-10 text-center text-sm text-ck-muted">{empty}</p>}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view === "list" && (
        <div className="flex items-center gap-3 border-b border-ck-border px-4 py-1.5 text-xs uppercase tracking-wider text-ck-muted">
          {COLS.map((c) => (
            <button
              key={c.key}
              onClick={() => onSort(c.key)}
              aria-label={`Sort by ${c.label}`}
              className={`${c.cls} text-left transition hover:text-ck-text ${c.key === "size" ? "!text-right" : ""} ${sortKey === c.key ? "text-ck-text" : ""}`}
            >
              {c.label} {sortKey === c.key && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
            </button>
          ))}
        </div>
      )}
      {listbox}
    </div>
  );
}
