import { Hono } from 'hono'
import type { Env } from '../index'

export const importRouter = new Hono<{ Bindings: Env }>()

interface RaindropRow {
  id?: string
  title?: string
  note?: string
  excerpt?: string
  url?: string
  folder?: string
  tags?: string
  created?: string
  cover?: string
  favorite?: string
}

// POST /api/import/raindrop  — body: { csv: "<raindrop export CSV string>" }
importRouter.post('/raindrop', async (c) => {
  const body = await c.req.json<{ csv: string }>()
  if (!body.csv) return c.json({ error: 'csv field required' }, 400)

  const rows = parseCsv(body.csv)
  if (!rows.length) return c.json({ error: 'No rows found in CSV' }, 400)

  const db = c.env.DB
  const stats = { imported: 0, skipped: 0, collections_created: 0 }

  // Pre-create collections from folder names
  const collectionMap = new Map<string, string>()
  const folders = [...new Set(rows.map(r => r.folder?.trim()).filter(Boolean) as string[])]

  for (const folder of folders) {
    const existing = await db.prepare('SELECT id FROM collections WHERE name = ?1').bind(folder).first<{ id: string }>()
    if (existing) {
      collectionMap.set(folder, existing.id)
    } else {
      const id = crypto.randomUUID()
      await db.prepare('INSERT INTO collections (id, name) VALUES (?1, ?2)').bind(id, folder).run()
      collectionMap.set(folder, id)
      stats.collections_created++
    }
  }

  for (const row of rows) {
    if (!row.url?.trim()) { stats.skipped++; continue }

    const id = crypto.randomUUID()
    const collectionId = row.folder?.trim() ? (collectionMap.get(row.folder.trim()) ?? null) : null
    const title = row.title?.trim() ?? ''
    const description = (row.excerpt?.trim() || row.note?.trim()) ?? ''
    const coverUrl = row.cover?.trim() ?? ''
    const isFavorite = row.favorite?.toLowerCase() === 'true' ? 1 : 0

    let createdAt: number
    try {
      createdAt = row.created ? Math.floor(new Date(row.created).getTime() / 1000) : Math.floor(Date.now() / 1000)
    } catch {
      createdAt = Math.floor(Date.now() / 1000)
    }

    try {
      await db.prepare(
        `INSERT INTO bookmarks (id, url, title, description, cover_url, collection_id, is_favorite, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`
      ).bind(id, row.url.trim(), title, description, coverUrl, collectionId, isFavorite, createdAt).run()

      // Tags
      if (row.tags?.trim()) {
        const tagNames = row.tags.split(',').map(t => t.trim()).filter(Boolean)
        for (const name of tagNames) {
          const tagId = crypto.randomUUID()
          await db.prepare('INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING').bind(tagId, name).run()
          const tag = await db.prepare('SELECT id FROM tags WHERE name = ?1').bind(name).first<{ id: string }>()
          if (tag) {
            await db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING')
              .bind(id, tag.id).run()
          }
        }
      }

      stats.imported++
    } catch {
      stats.skipped++
    }
  }

  return c.json(stats)
})

// Minimal CSV parser that handles quoted fields (Raindrop export format)
function parseCsv(csv: string): RaindropRow[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  const headers = parseFields(lines[0] ?? '')
  const rows: RaindropRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.trim()) continue
    const values = parseFields(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h.toLowerCase()] = values[idx] ?? '' })
    rows.push(row as RaindropRow)
  }

  return rows
}

function parseFields(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      i++
      let field = ''
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (line[i] === '"') {
          i++
          break
        } else {
          field += line[i++]
        }
      }
      fields.push(field)
      if (line[i] === ',') i++
    } else {
      const end = line.indexOf(',', i)
      if (end === -1) {
        fields.push(line.slice(i))
        break
      }
      fields.push(line.slice(i, end))
      i = end + 1
    }
  }
  return fields
}
