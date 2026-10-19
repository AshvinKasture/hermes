export interface SavedProgramSummary {
  name: string
  updatedAt: string
}

export interface SavedProgram {
  name: string
  code: string
  updatedAt: string
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.href = '/fiddle/api/auth/login'
    throw new Error('Not authenticated')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data && (data as { error?: string }).error) || `Request failed (${res.status})`)
  }
  return data as T
}

export const programsApi = {
  list: (): Promise<SavedProgramSummary[]> => fetch('/fiddle/api/programs').then((r) => parseJsonOrThrow(r)),

  get: (name: string): Promise<SavedProgram> =>
    fetch(`/fiddle/api/programs/${encodeURIComponent(name)}`).then((r) => parseJsonOrThrow(r)),

  save: (name: string, code: string): Promise<{ name: string }> =>
    fetch('/fiddle/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code }),
    }).then((r) => parseJsonOrThrow(r)),

  remove: (name: string): Promise<{ deleted: boolean }> =>
    fetch(`/fiddle/api/programs/${encodeURIComponent(name)}`, { method: 'DELETE' }).then((r) => parseJsonOrThrow(r)),
}
