import { useState } from 'react'
import type { Collection } from '../api'

interface Props {
  collections: Collection[]
  onSave: (data: { url: string; title?: string; collection_id?: string; tags?: string[] }) => Promise<void>
  onClose: () => void
}

export default function AddBookmark({ collections, onSave, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setSaving(true)
    setError('')
    try {
      await onSave({
        url: url.trim(),
        title: title.trim() || undefined,
        collection_id: collectionId || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-title">Add Bookmark</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label">URL *</label>
            <input
              className="form-input"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://…"
              autoFocus
              required
            />
          </div>
          <div className="form-field">
            <label className="form-label">Title <span style={{ fontWeight: 400 }}>(auto-fetched if blank)</span></label>
            <input
              className="form-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Leave blank to auto-fetch"
            />
          </div>
          <div className="form-field">
            <label className="form-label">Collection</label>
            <select className="form-select" value={collectionId} onChange={e => setCollectionId(e.target.value)}>
              <option value="">No collection</option>
              {collections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label">Tags</label>
            <input
              className="form-input"
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="ai, research, newsletter"
            />
          </div>
          {error && <p style={{ color: '#f85149', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !url.trim()}>
              {saving ? 'Saving…' : 'Save bookmark'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
