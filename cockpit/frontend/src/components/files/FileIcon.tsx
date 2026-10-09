import { categoryFor } from "../../lib/fileUtils";
import type { FsEntry } from "../../lib/files";

export function FileIcon({ entry, large = false }: { entry: FsEntry; large?: boolean }) {
  const box = large ? "h-12 w-12" : "h-8 w-8";
  let icon;
  if (entry.broken) {
    icon = <span className={`${box} flex items-center justify-center rounded-lg bg-ck-red/15 text-sm font-bold text-ck-red`}>!</span>;
  } else if (entry.kind === "dir") {
    icon = (
      <svg viewBox="0 0 24 24" className={`${box} text-ck-accent`} fill="currentColor" aria-hidden>
        <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.9c.5 0 .98.2 1.33.56L12 5.9h6.5A2.5 2.5 0 0 1 21 8.4v9.1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z" opacity=".9" />
      </svg>
    );
  } else {
    const c = categoryFor(entry.name);
    icon = <span className={`${box} flex items-center justify-center rounded-lg text-[10px] font-semibold tracking-wide ${c.tone}`}>{c.label}</span>;
  }
  return (
    <span className="relative inline-flex shrink-0">
      {icon}
      {entry.isSymlink && (
        <span title={`Symlink${entry.linkTarget ? ` → ${entry.linkTarget}` : ""}`} className="absolute -bottom-1 -right-1 rounded bg-ck-bg px-0.5 text-[10px] leading-none text-ck-muted ring-1 ring-ck-border">
          ↪
        </span>
      )}
    </span>
  );
}
