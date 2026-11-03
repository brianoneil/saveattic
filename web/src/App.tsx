import { useState, useEffect, useCallback } from 'react'
import { api, type Bookmark, type Collection, type Tag } from './api'
import Sidebar from './components/Sidebar'
import BookmarkList from './components/BookmarkList'
import AddBookmark from './components/AddBookmark'
import ImportModal from './components/ImportModal'
import './App.css'

export interface AppState {
  bookmarks: Bookmark[]
  collections: Collection[]
  tags: Tag[]
  loading: boolean
  selectedCollection: string | null
  selectedTag: string | null
  searchQuery: string
  showFavorites: boolean
}

export default function App() {
  const [state, setState] = useState<AppState>({
    bookmarks: [],
    collections: [],
    tags: [],
    loading: true,
    selectedCollection: null,
    selectedTag: null,
    searchQuery: '',
    showFavorites: false,
  })
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const loadCollections = useCallback(async () => {
    const [collections, tags] = await Promise.all([api.collections.list(), api.tags.list()])
    setState(s => ({ ...s, collections, tags }))
  }, [])

  const loadBookmarks = useCallback(async (s: AppState) => {
    setState(prev => ({ ...prev, loading: true }))
    try {
      const bookmarks = await api.bookmarks.list({
        collection: s.selectedCollection ?? undefined,
        tag: s.selectedTag ?? undefined,
        q: s.searchQuery || undefined,
        favorite: s.showFavorites ? '1' : undefined,
        limit: 100,
      })
      setState(prev => ({ ...prev, bookmarks, loading: false }))
    } catch {
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [])

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  useEffect(() => {
    loadBookmarks(state)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedCollection, state.selectedTag, state.searchQuery, state.showFavorites])

  function setFilter(update: Partial<Pick<AppState, 'selectedCollection' | 'selectedTag' | 'searchQuery' | 'showFavorites'>>) {
    setState(s => ({ ...s, ...update }))
  }

  async function handleAdd(data: { url: string; title?: string; collection_id?: string; tags?: string[] }) {
    await api.bookmarks.create(data)
    setShowAdd(false)
    loadBookmarks(state)
    loadCollections()
  }

  async function handleDelete(id: string) {
    await api.bookmarks.delete(id)
    setState(s => ({ ...s, bookmarks: s.bookmarks.filter(b => b.id !== id) }))
    loadCollections()
  }

  async function handleToggleFavorite(bm: Bookmark) {
    const updated = await api.bookmarks.update(bm.id, { is_favorite: !bm.is_favorite })
    setState(s => ({ ...s, bookmarks: s.bookmarks.map(b => b.id === updated.id ? updated : b) }))
  }

  async function handleImport(csv: string) {
    const result = await api.import.raindrop(csv)
    setShowImport(false)
    loadCollections()
    loadBookmarks(state)
    return result
  }

  return (
    <div className="app">
      <Sidebar
        collections={state.collections}
        tags={state.tags}
        selectedCollection={state.selectedCollection}
        selectedTag={state.selectedTag}
        showFavorites={state.showFavorites}
        searchQuery={state.searchQuery}
        onSelectCollection={id => setFilter({ selectedCollection: id, selectedTag: null, showFavorites: false })}
        onSelectTag={name => setFilter({ selectedTag: name, selectedCollection: null, showFavorites: false })}
        onShowFavorites={() => setFilter({ showFavorites: true, selectedCollection: null, selectedTag: null })}
        onShowAll={() => setFilter({ selectedCollection: null, selectedTag: null, showFavorites: false })}
        onSearch={q => setFilter({ searchQuery: q })}
        onAdd={() => setShowAdd(true)}
        onImport={() => setShowImport(true)}
      />
      <main className="main">
        <BookmarkList
          bookmarks={state.bookmarks}
          collections={state.collections}
          loading={state.loading}
          onDelete={handleDelete}
          onToggleFavorite={handleToggleFavorite}
          onRefresh={() => loadBookmarks(state)}
        />
      </main>
      {showAdd && (
        <AddBookmark
          collections={state.collections}
          onSave={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
