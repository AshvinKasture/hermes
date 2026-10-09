import { api, ApiError, BASE } from "./api";

export type EntryKind = "file" | "dir" | "other";

export interface FsEntry {
  name: string;
  path: string;
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  mode: number;
  isSymlink: boolean;
  linkTarget?: string;
  targetPath?: string;
  broken?: boolean;
  writable: boolean;
}

export interface Listing {
  path: string;
  parent: string | null;
  writable: boolean;
  entries: FsEntry[];
  truncated: boolean;
}

export interface FsInfo {
  home: string;
  trashDir: string;
  maxEditBytes: number;
  maxUploadBytes: number;
}

export interface FileContent {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  etag: string;
  mode: number;
  writable: boolean;
  binary: boolean;
  tooLarge: boolean;
  content: string | null;
}

export interface SearchResult {
  results: { name: string; path: string; kind: EntryKind }[];
  truncated: boolean;
}

const enc = encodeURIComponent;
const post = <T>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const fsInfo = () => api<FsInfo>("/fs/info");
export const listDir = (path: string) => api<Listing>(`/fs/list?path=${enc(path)}`);
export const readFile = (path: string) => api<FileContent>(`/fs/read?path=${enc(path)}`);
export const writeFile = (path: string, content: string, etag?: string) =>
  api<{ etag: string; size: number; mtimeMs: number }>("/fs/write", { method: "PUT", body: JSON.stringify({ path, content, etag }) });
export const createEntry = (dir: string, name: string, type: "file" | "dir") => post<FsEntry>("/fs/create", { dir, name, type });
export const renameEntry = (from: string, to: string) => post<FsEntry>("/fs/rename", { from, to });
export const deleteEntry = (path: string) => post<{ trashed: boolean; permanent: boolean; name: string }>("/fs/delete", { path });
export const searchFiles = (path: string, q: string) => api<SearchResult>(`/fs/search?path=${enc(path)}&q=${enc(q)}`);
export const downloadUrl = (path: string) => `${BASE}/api/fs/download?path=${enc(path)}`;

export async function uploadFile(dir: string, file: File, overwrite = false): Promise<FsEntry> {
  const res = await fetch(`${BASE}/api/fs/upload?dir=${enc(dir)}&name=${enc(file.name)}${overwrite ? "&overwrite=1" : ""}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(res.status, body.error ?? res.statusText, body.code);
  }
  return (await res.json()) as FsEntry;
}
