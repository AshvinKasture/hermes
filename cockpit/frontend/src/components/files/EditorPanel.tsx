import { useState } from "react";
import { ApiError } from "../../lib/api";
import { downloadUrl, readFile, writeFile } from "../../lib/files";
import { formatBytes } from "../../lib/format";
import { Editor } from "./Editor";

export interface OpenFile {
  path: string;
  name: string;
  /** Last content known to be on disk. */
  saved: string;
  /** Current editor content. */
  draft: string;
  etag: string;
  writable: boolean;
  size: number;
  /** Set for files we can't show as text. */
  blocked?: "binary" | "tooLarge";
  conflict?: boolean;
  saving?: boolean;
  error?: string;
}

export const isDirty = (f: OpenFile) => !f.blocked && f.draft !== f.saved;

interface Props {
  files: OpenFile[];
  activePath: string | null;
  mode: "preview" | "fullscreen";
  onModeChange: (mode: "preview" | "fullscreen") => void;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onUpdate: (path: string, patch: Partial<OpenFile>) => void;
  onSaved: (path: string) => void;
}

export function EditorPanel({ files, activePath, mode, onModeChange, onActivate, onClose, onUpdate, onSaved }: Props) {
  const active = files.find((f) => f.path === activePath) ?? null;
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  async function save(file: OpenFile, force = false) {
    if (!file.writable || file.blocked || file.saving) return;
    onUpdate(file.path, { saving: true, error: undefined });
    try {
      const res = await writeFile(file.path, file.draft, force ? undefined : file.etag);
      onUpdate(file.path, { saving: false, saved: file.draft, etag: res.etag, size: res.size, conflict: false });
      onSaved(file.path);
    } catch (err) {
      if (err instanceof ApiError && err.code === "conflict") onUpdate(file.path, { saving: false, conflict: true });
      else onUpdate(file.path, { saving: false, error: err instanceof Error ? err.message : "Could not save" });
    }
  }

  async function reload(file: OpenFile) {
    try {
      const f = await readFile(file.path);
      onUpdate(file.path, { saved: f.content ?? "", draft: f.content ?? "", etag: f.etag, size: f.size, conflict: false, error: undefined });
    } catch (err) {
      onUpdate(file.path, { error: err instanceof Error ? err.message : "Could not reload" });
    }
  }

  function requestClose(f: OpenFile) {
    if (isDirty(f)) setConfirmClose(f.path);
    else onClose(f.path);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ck-bg">
      <div role="tablist" aria-label="Open files" className="scrollbar-thin flex shrink-0 items-center overflow-x-auto border-b border-ck-border bg-ck-surface">
        <div className="flex min-w-0 flex-1">
          {files.map((f) => {
            const dirty = isDirty(f);
            const isActive = f.path === activePath;
            return (
              <div key={f.path} className={`group flex shrink-0 items-center gap-2 border-r border-ck-border px-3 py-2 text-sm ${isActive ? "bg-ck-bg text-ck-text" : "text-ck-muted hover:text-ck-text"}`}>
                <button role="tab" aria-selected={isActive} onClick={() => onActivate(f.path)} title={f.path} className="max-w-[12rem] truncate">
                  {f.name}
                </button>
                {dirty && <span aria-label="Unsaved changes" title="Unsaved changes" className="h-2 w-2 rounded-full bg-ck-amber" />}
                <button onClick={() => requestClose(f)} aria-label={`Close ${f.name}`} className="rounded px-1 text-ck-muted transition hover:bg-ck-raised hover:text-ck-text">×</button>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => onModeChange(mode === "fullscreen" ? "preview" : "fullscreen")}
          aria-pressed={mode === "fullscreen"}
          aria-label={mode === "fullscreen" ? "Exit fullscreen" : "Open fullscreen"}
          title={mode === "fullscreen" ? "Exit fullscreen" : "Open fullscreen"}
          className="mx-2 shrink-0 rounded-lg border border-ck-border px-2 py-1 text-xs text-ck-muted transition hover:bg-ck-raised hover:text-ck-text"
        >
          {mode === "fullscreen" ? "⤓ Preview" : "⤢ Fullscreen"}
        </button>
      </div>

      {active ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ck-border px-4 py-2 text-xs text-ck-muted">
            <span className="truncate font-mono" title={active.path}>{active.path}</span>
            <span>{formatBytes(active.size)}</span>
            {!active.writable && <span className="rounded bg-ck-raised px-2 py-0.5">Read-only</span>}
            <span className="ml-auto flex items-center gap-2">
              {active.error && <span role="alert" className="text-ck-red">{active.error}</span>}
              <a href={downloadUrl(active.path)} className="rounded-lg border border-ck-border px-2.5 py-1 transition hover:text-ck-text">Download</a>
              {active.writable && !active.blocked && (
                <button
                  onClick={() => void save(active)}
                  disabled={!isDirty(active) || active.saving}
                  className="rounded-lg bg-ck-accent px-3 py-1 font-medium text-ck-bg transition hover:brightness-110 disabled:opacity-40"
                >
                  {active.saving ? "Saving…" : "Save"}
                </button>
              )}
            </span>
          </div>

          {active.conflict && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ck-amber/40 bg-ck-amber/10 px-4 py-2 text-sm text-ck-amber">
              <span>This file changed on disk since you opened it.</span>
              <button onClick={() => void save(active, true)} className="rounded-lg border border-ck-amber/50 px-2.5 py-1 transition hover:bg-ck-amber/10">Overwrite with my version</button>
              <button onClick={() => void reload(active)} className="rounded-lg border border-ck-amber/50 px-2.5 py-1 transition hover:bg-ck-amber/10">Discard mine and reload</button>
            </div>
          )}

          <div className="min-h-0 flex-1">
            {active.blocked ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-ck-muted">
                <p>{active.blocked === "binary" ? "This looks like a binary file, so it can't be shown as text." : `This file is ${formatBytes(active.size)}, which is too large to edit here.`}</p>
                <a href={downloadUrl(active.path)} className="rounded-lg bg-ck-accent px-4 py-2 font-medium text-ck-bg transition hover:brightness-110">Download</a>
              </div>
            ) : (
              <Editor
                key={active.path}
                name={active.name}
                value={active.draft}
                readOnly={!active.writable}
                onChange={(v) => onUpdate(active.path, { draft: v })}
                onSave={() => void save(active)}
              />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-ck-muted">Open a file to view or edit it.</div>
      )}

      {confirmClose && (
        <div role="dialog" aria-modal="true" aria-label="Unsaved changes" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-ck-border bg-ck-surface p-5 shadow-2xl">
            <h3 className="font-semibold">Close without saving?</h3>
            <p className="mt-1 text-sm text-ck-muted">{files.find((f) => f.path === confirmClose)?.name} has unsaved changes.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmClose(null)} className="rounded-lg border border-ck-border px-3 py-1.5 text-sm transition hover:bg-ck-raised">Keep editing</button>
              <button
                onClick={() => {
                  onClose(confirmClose);
                  setConfirmClose(null);
                }}
                className="rounded-lg bg-ck-red px-3 py-1.5 text-sm font-medium text-ck-bg transition hover:brightness-110"
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
