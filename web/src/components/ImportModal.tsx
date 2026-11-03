import { useState, useRef } from 'react'
import type { ImportStats } from '../api'

interface Props {
  onImport: (csv: string) => Promise<ImportStats>
  onClose: () => void
}

export default function ImportModal({ onImport, onClose }: Props) {
  const [csv, setCsv] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportStats | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCsv(ev.target?.result as string ?? '')
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!csv.trim()) return
    setLoading(true)
    setError('')
    try {
      const stats = await onImport(csv)
      setResult(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-title">Import from Raindrop.io</h2>

        {!result ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Export your Raindrop.io bookmarks as CSV, then upload the file here.
              Go to Raindrop.io → Settings → Backup → Export CSV.
            </p>

            <div className="form-field">
              <label className="form-label">CSV File</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => fileRef.current?.click()}
              >
                {csv ? '✓ File loaded — click to replace' : 'Choose CSV file…'}
              </button>
            </div>

            {csv && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {csv.split('\n').length - 1} rows detected
              </p>
            )}

            {error && <p style={{ color: '#f85149', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={!csv.trim() || loading}
              >
                {loading ? 'Importing…' : 'Import bookmarks'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>✓</p>
              <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Import complete</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {result.imported} bookmarks imported · {result.skipped} skipped · {result.collections_created} collections created
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
