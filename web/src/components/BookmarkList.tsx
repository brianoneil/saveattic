import { useState } from 'react'
import type { Bookmark, Collection } from '../api'
import { api } from '../api'
import './BookmarkList.css'

interface Props {
  bookmarks: Bookmark[]
  collections: Collection[]
  loading: boolean
  onDelete: (id: string) => void
  onToggleFavorite: (bm: Bookmark) => void
  onRefresh: () => void
}

export default function BookmarkList({ bookmarks, collections, loading, onDelete, onToggleFavorite }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

  function collectionName(id: string | null) {
    if (!id) return null
    return collections.find(c => c.id === id)?.name ?? null
  }

  function domain(url: string) {
    try { return new URL(url).hostname.replace('www.', '') }
    catch { return url }
  }

  function timeAgo(ts: number) {
    const diff = Math.floor(Date.now() / 1000) - ts
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return new Date(ts * 1000).toLocaleDateString()
  }

  if (loading) {
    return <div className="empty-state">Loading…</div>
  }

  if (!bookmarks.length) {
    return <div className="empty-state">No bookmarks here yet.</div>
  }

  return (
    <ul className="bookmark-list">
      {bookmarks.map(bm => (
        <li key={bm.id} className="bookmark-item">
          {bm.cover_url && (
            <div className="bookmark-cover">
              <img src={bm.cover_url} alt="" loading="lazy" />
            </div>
          )}
          <div className="bookmark-body">
            <div className="bookmark-meta">
              <span className="bookmark-domain">{domain(bm.url)}</span>
              {collectionName(bm.collection_id) && (
                <span className="bookmark-collection">{collectionName(bm.collection_id)}</span>
              )}
              <span className="bookmark-time">{timeAgo(bm.created_at)}</span>
            </div>
            <a className="bookmark-title" href={bm.url} target="_blank" rel="noreferrer">
              {bm.title || bm.url}
            </a>
            {bm.description && (
              <p className="bookmark-desc">{bm.description}</p>
            )}
            {bm.tags.length > 0 && (
              <div className="bookmark-tags">
                {bm.tags.map(t => (
                  <span key={t} className="bookmark-tag">#{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="bookmark-actions">
            <button
              className={`action-btn ${bm.is_favorite ? 'active' : ''}`}
              title={bm.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => onToggleFavorite(bm)}
            >
              ★
            </button>
            <EditTagsButton bookmarkId={bm.id} currentTags={bm.tags} onDone={() => setEditingId(null)} isEditing={editingId === bm.id} onEdit={() => setEditingId(bm.id)} />
            <button
              className="action-btn danger"
              title="Delete"
              onClick={() => {
                if (confirm('Delete this bookmark?')) onDelete(bm.id)
              }}
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function EditTagsButton({ bookmarkId, currentTags, onDone, isEditing, onEdit }: {
  bookmarkId: string
  currentTags: string[]
  onDone: () => void
  isEditing: boolean
  onEdit: () => void
}) {
  const [value, setValue] = useState(currentTags.join(', '))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const tags = value.split(',').map(t => t.trim()).filter(Boolean)
    await api.bookmarks.update(bookmarkId, { tags })
    setSaving(false)
    onDone()
    window.location.reload()
  }

  if (!isEditing) {
    return (
      <button className="action-btn" title="Edit tags" onClick={onEdit}>
        ⌗
      </button>
    )
  }

  return (
    <div className="inline-edit">
      <input
        className="inline-tag-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="tag1, tag2"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone() }}
      />
      <button className="action-btn" onClick={save} disabled={saving}>✓</button>
      <button className="action-btn" onClick={onDone}>✕</button>
    </div>
  )
}
