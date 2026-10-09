export class FsError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

/** Map a Node fs error to an API error. */
export function toFsError(err: unknown): FsError {
  if (err instanceof FsError) return err;
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ENOENT":
      return new FsError(404, "not_found", "No such file or directory");
    case "ENOTDIR":
      return new FsError(400, "not_a_directory", "A path component is not a directory");
    case "EACCES":
    case "EPERM":
      return new FsError(403, "permission_denied", "Permission denied");
    case "EROFS":
      return new FsError(403, "read_only", "This location is read-only");
    case "ENAMETOOLONG":
      return new FsError(400, "invalid_path", "Path is too long");
    case "EISDIR":
      return new FsError(400, "is_a_directory", "Path is a directory");
    default:
      console.error("[fs] unexpected error:", err);
      return new FsError(500, "internal", "Filesystem error");
  }
}
