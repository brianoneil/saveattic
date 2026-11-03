const BASE = import.meta.env.VITE_API_URL ?? ''

export interface Bookmark {
  id: string
  url: string
  title: string
  description: string
  cover_url: string
  collection_id: string | null
  is_favorite: boolean
  created_at: number
  updated_at: number
  tags: string[]
}

export interface Collection {
  id: string
  name: string
  description: string
  parent_id: string | null
  color: string
  bookmark_count: number
}

export interface Tag {
  id: string
  name: string
  bookmark_count: number
}

export interface ImportStats {
  imported: number
  skipped: number
  collections_created: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  bookmarks: {
    list: (params?: { collection?: string; tag?: string; q?: string; favorite?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams()
      if (params?.collection) qs.set('collection', params.collection)
      if (params?.tag) qs.set('tag', params.tag)
      if (params?.q) qs.set('q', params.q)
      if (params?.favorite) qs.set('favorite', params.favorite)
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.offset) qs.set('offset', String(params.offset))
      return req<Bookmark[]>(`/api/bookmarks?${qs}`)
    },
    get: (id: string) => req<Bookmark>(`/api/bookmarks/${id}`),
    create: (data: Partial<Bookmark> & { url: string }) =>
      req<Bookmark>('/api/bookmarks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Bookmark>) =>
      req<Bookmark>(`/api/bookmarks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/api/bookmarks/${id}`, { method: 'DELETE' }),
  },
  collections: {
    list: () => req<Collection[]>('/api/collections'),
    create: (data: { name: string; description?: string; color?: string }) =>
      req<Collection>('/api/collections', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Collection>) =>
      req<Collection>(`/api/collections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => req<{ ok: boolean }>(`/api/collections/${id}`, { method: 'DELETE' }),
  },
  tags: {
    list: () => req<Tag[]>('/api/tags'),
    delete: (id: string) => req<{ ok: boolean }>(`/api/tags/${id}`, { method: 'DELETE' }),
  },
  import: {
    raindrop: (csv: string) =>
      req<ImportStats>('/api/import/raindrop', { method: 'POST', body: JSON.stringify({ csv }) }),
  },
}
