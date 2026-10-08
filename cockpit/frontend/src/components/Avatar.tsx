import { useState } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Profile picture with an initials fallback when missing or blocked. */
export function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  const ring = "h-9 w-9 rounded-full ring-2 ring-ck-accent/60";

  if (!src || failed) {
    return (
      <span
        aria-label={name}
        className={`${ring} flex items-center justify-center bg-ck-raised text-sm font-semibold text-ck-accent`}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className={`${ring} object-cover`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
