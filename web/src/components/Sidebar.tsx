import type { Collection, Tag } from '../api'
import './Sidebar.css'

interface Props {
  collections: Collection[]
  tags: Tag[]
  selectedCollection: string | null
  selectedTag: string | null
  showFavorites: boolean
  searchQuery: string
  onSelectCollection: (id: string | null) => void
  onSelectTag: (name: string | null) => void
  onShowFavorites: () => void
  onShowAll: () => void
  onSearch: (q: string) => void
  onAdd: () => void
  onImport: () => void
}

export default function Sidebar(props: Props) {
  const { collections, tags, selectedCollection, selectedTag, showFavorites, searchQuery } = props

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">Linkdrop</span>
        <button className="add-btn" onClick={props.onAdd} title="Add bookmark">+</button>
      </div>

      <div className="search-wrap">
        <input
          className="search-input"
          type="search"
          placeholder="Search bookmarks…"
          value={searchQuery}
          onChange={e => props.onSearch(e.target.value)}
        />
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${!selectedCollection && !selectedTag && !showFavorites ? 'active' : ''}`}
          onClick={props.onShowAll}
        >
          <span className="nav-icon">◈</span> All bookmarks
        </button>
        <button
          className={`nav-item ${showFavorites ? 'active' : ''}`}
          onClick={props.onShowFavorites}
        >
          <span className="nav-icon">★</span> Favorites
        </button>
      </nav>

      {collections.length > 0 && (
        <section className="sidebar-section">
          <p className="section-label">Collections</p>
          {collections.map(col => (
            <button
              key={col.id}
              className={`nav-item ${selectedCollection === col.id ? 'active' : ''}`}
              onClick={() => props.onSelectCollection(col.id)}
            >
              <span className="nav-icon collection-dot" style={{ background: col.color || '#58a6ff' }} />
              <span className="nav-name">{col.name}</span>
              <span className="nav-count">{col.bookmark_count}</span>
            </button>
          ))}
        </section>
      )}

      {tags.length > 0 && (
        <section className="sidebar-section">
          <p className="section-label">Tags</p>
          <div className="tag-cloud">
            {tags.map(tag => (
              <button
                key={tag.id}
                className={`tag-btn ${selectedTag === tag.name ? 'active' : ''}`}
                onClick={() => props.onSelectTag(selectedTag === tag.name ? null : tag.name)}
              >
                #{tag.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="sidebar-footer">
        <button className="footer-btn" onClick={props.onImport}>Import from Raindrop</button>
      </div>
    </aside>
  )
}
