// BASE_URL is "/cockpit/" in production (vite `base`), so all calls stay under the prefix.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface Me {
  name: string;
  email: string;
  picture: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function loginUrl(): string {
  return `${BASE}/auth/google`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const fetchMe = () => api<Me>("/me");

export async function logout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "same-origin" });
}
