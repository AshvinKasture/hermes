import express, { Router, type NextFunction, type Request, type Response } from "express";
import { audit } from "../audit";
import { FsError, toFsError } from "../fs/errors";
import type { FileService } from "../fs/service";

const q = (req: Request, key: string): unknown => (typeof req.query[key] === "string" ? req.query[key] : undefined);

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

/** RFC 5987 filename for Content-Disposition (safe for non-ASCII and quotes). */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function fsRouter(files: FileService): Router {
  const router = Router();
  const info = files.info();
  // Escaped JSON can be larger than the text it carries, so allow headroom.
  const writeBody = express.json({ limit: info.maxEditBytes * 2 + 4096 });

  router.get("/info", (_req, res) => {
    res.json(info);
  });

  router.get("/list", wrap(async (req, res) => {
    res.json(await files.list(q(req, "path")));
  }));

  router.get("/read", wrap(async (req, res) => {
    res.json(await files.read(q(req, "path")));
  }));

  router.put("/write", writeBody, wrap(async (req, res) => {
    const { path, content, etag } = req.body ?? {};
    const result = await files.write(path, content, etag);
    audit(req, "fs.write", String(path));
    res.json(result);
  }));

  router.post("/create", wrap(async (req, res) => {
    const { dir, name, type } = req.body ?? {};
    const entry = await files.create(dir, name, type);
    audit(req, "fs.create", `${entry.path} (${entry.kind})`);
    res.status(201).json(entry);
  }));

  router.post("/rename", wrap(async (req, res) => {
    const { from, to } = req.body ?? {};
    const entry = await files.rename(from, to);
    audit(req, "fs.rename", `${from} -> ${entry.path}`);
    res.json(entry);
  }));

  router.post("/delete", wrap(async (req, res) => {
    const { path } = req.body ?? {};
    const result = await files.remove(path);
    audit(req, result.permanent ? "fs.delete" : "fs.trash", String(path));
    res.json(result);
  }));

  router.get("/download", wrap(async (req, res) => {
    const { stream, name, size } = await files.openDownload(q(req, "path"));
    audit(req, "fs.download", String(q(req, "path")));
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(size));
    res.setHeader("Content-Disposition", contentDisposition(name));
    res.setHeader("Cache-Control", "no-store");
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }));

  // Raw body upload: PUT /upload?dir=...&name=...&overwrite=1
  router.put("/upload", wrap(async (req, res) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > info.maxUploadBytes) throw new FsError(413, "too_large", "Upload exceeds the size limit");
    const entry = await files.upload(q(req, "dir"), q(req, "name"), req, q(req, "overwrite") === "1");
    audit(req, "fs.upload", entry.path);
    res.status(201).json(entry);
  }));

  router.get("/search", wrap(async (req, res) => {
    res.json(await files.search(q(req, "path"), q(req, "q")));
  }));

  return router;
}

/** Converts FsError (and body-parser errors) into JSON responses. */
export function fsErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);
  const http = err as { type?: string; status?: number };
  if (http.type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large", code: "too_large" });
    return;
  }
  if (http.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON", code: "invalid_body" });
    return;
  }
  const e = toFsError(err);
  res.status(e.status).json({ error: e.message, code: e.code });
}
