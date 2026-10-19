import { useEffect, useState } from 'react'
import { programsApi, type SavedProgramSummary } from './programsApi'

interface SaveModalProps {
  defaultName: string
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

export function SaveModal({ defaultName, onSave, onClose }: SaveModalProps) {
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name for the program.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Save Program</h2>
        <input
          className="modal-input"
          type="text"
          autoFocus
          placeholder="Program name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn-primary" onClick={() => void submit()} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface OpenModalProps {
  onOpen: (name: string) => void
  onClose: () => void
}

export function OpenModal({ onOpen, onClose }: OpenModalProps) {
  const [programs, setPrograms] = useState<SavedProgramSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = () => {
    programsApi
      .list()
      .then(setPrograms)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load programs'))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return
    setDeleting(name)
    try {
      await programsApi.remove(name)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Open Program</h2>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-list">
          {programs === null && <div className="output-placeholder">Loading…</div>}
          {programs !== null && programs.length === 0 && (
            <div className="output-placeholder">No saved programs yet.</div>
          )}
          {programs?.map((p) => (
            <div key={p.name} className="modal-list-item" onClick={() => onOpen(p.name)}>
              <div>
                <div className="modal-list-name">{p.name}</div>
                <div className="modal-list-date">{new Date(p.updatedAt).toLocaleString()}</div>
              </div>
              <button
                className="modal-list-delete"
                onClick={(e) => void handleDelete(p.name, e)}
                disabled={deleting === p.name}
                title="Delete"
              >
                {deleting === p.name ? '…' : '×'}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
