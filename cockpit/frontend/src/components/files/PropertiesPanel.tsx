import { categoryFor, formatDate, formatMode } from "../../lib/fileUtils";
import type { FsEntry } from "../../lib/files";
import { formatBytes } from "../../lib/format";

/** A Windows-style "Properties" side panel: read-only details for one entry. */
export function PropertiesPanel({ entry, onClose }: { entry: FsEntry; onClose: () => void }) {
  const kind = entry.kind === "dir" ? "Folder" : entry.kind === "file" ? categoryFor(entry.name).label + " file" : "Other";
  const rows: [string, string][] = [
    ["Name", entry.name],
    ["Type", kind],
    ["Location", entry.path],
    ["Size", entry.kind === "file" ? formatBytes(entry.size) : "—"],
    ["Modified", formatDate(entry.mtimeMs)],
    ["Permissions", formatMode(entry.mode)],
    ["Access", entry.writable ? "Read & write" : "Read-only"],
  ];
  if (entry.isSymlink) rows.push(["Symlink target", entry.linkTarget ?? "unknown"]);

  return (
    <aside aria-label="Properties" className="flex w-72 shrink-0 flex-col border-l border-ck-border bg-ck-surface">
      <div className="flex items-center justify-between border-b border-ck-border px-4 py-3">
        <h3 className="text-sm font-semibold">Properties</h3>
        <button onClick={onClose} aria-label="Close properties" className="rounded px-1.5 text-ck-muted transition hover:bg-ck-raised hover:text-ck-text">×</button>
      </div>
      <dl className="scrollbar-thin flex-1 overflow-y-auto p-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="border-b border-ck-border/60 py-2 last:border-0">
            <dt className="text-xs text-ck-muted">{label}</dt>
            <dd className="mt-0.5 break-all text-ck-text">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
