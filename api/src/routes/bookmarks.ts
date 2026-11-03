import { Hono } from 'hono'
import type { Env } from '../index'
import { fetchMetadata } from '../lib/metadata'

export const bookmarksRouter = new Hono<{ Bindings: Env }>()

// GET /api/bookmarks?collection=&tag=&q=&limit=&offset=&favorite=
bookmarksRouter.get('/', async (c) => {
  const { collection, tag, q, limit = '50', offset = '0', favorite } = c.req.query()
  const db = c.env.DB

  if (q?.trim()) {
    const rows = await db
      .prepare(
        `SELECT b.*, GROUP_CONCAT(t.name) AS tags
         FROM bookmarks_fts f
         JOIN bookmarks b ON b.rowid = f.rowid
         LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
         LEFT JOIN tags t ON t.id = bt.tag_id
         WHERE bookmarks_fts MATCH ?1
         GROUP BY b.id
         ORDER BY b.created_at DESC
         LIMIT ?2 OFFSET ?3`
      )
      .bind(q.trim(), Number(limit), Number(offset))
      .all()
    return c.json(rows.results.map(normalizeRow))
  }

  let sql = `
    SELECT b.*, GROUP_CONCAT(t.name) AS tags
    FROM bookmarks b
    LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
    LEFT JOIN tags t ON t.id = bt.tag_id
  `
  const params: unknown[] = []
  const where: string[] = []

  if (collection) {
    where.push(`b.collection_id = ?${params.length + 1}`)
    params.push(collection)
  }
  if (favorite === '1') {
    where.push(`b.is_favorite = 1`)
  }
  if (tag) {
    sql += ` JOIN bookmark_tags bt2 ON bt2.bookmark_id = b.id JOIN tags t2 ON t2.id = bt2.tag_id AND t2.name = ?${params.length + 1}`
    params.push(tag)
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  sql += ` GROUP BY b.id ORDER BY b.created_at DESC LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`
  params.push(Number(limit), Number(offset))

  const rows = await db.prepare(sql).bind(...params).all()
  return c.json(rows.results.map(normalizeRow))
})

// GET /api/bookmarks/:id
bookmarksRouter.get('/:id', async (c) => {
  const { id } = c.req.param()
  const row = await c.env.DB.prepare(
    `SELECT b.*, GROUP_CONCAT(t.name) AS tags
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE b.id = ?1
     GROUP BY b.id`
  ).bind(id).first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(normalizeRow(row))
})

// POST /api/bookmarks
bookmarksRouter.post('/', async (c) => {
  const body = await c.req.json<{
    url: string
    title?: string
    description?: string
    cover_url?: string
    collection_id?: string
    tags?: string[]
    is_favorite?: boolean
  }>()

  if (!body.url) return c.json({ error: 'url is required' }, 400)

  let { title = '', description = '', cover_url = '' } = body

  if (!title) {
    const meta = await fetchMetadata(body.url)
    title = meta.title
    description = description || meta.description
    cover_url = cover_url || meta.cover_url
  }

  const id = crypto.randomUUID()
  const db = c.env.DB

  await db.prepare(
    `INSERT INTO bookmarks (id, url, title, description, cover_url, collection_id, is_favorite)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).bind(id, body.url, title, description, cover_url, body.collection_id ?? null, body.is_favorite ? 1 : 0).run()

  if (body.tags?.length) {
    await upsertTags(db, id, body.tags)
  }

  const row = await db.prepare(
    `SELECT b.*, GROUP_CONCAT(t.name) AS tags
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE b.id = ?1 GROUP BY b.id`
  ).bind(id).first()

  return c.json(normalizeRow(row!), 201)
})

// PUT /api/bookmarks/:id
bookmarksRouter.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    title?: string
    description?: string
    cover_url?: string
    collection_id?: string | null
    is_favorite?: boolean
    tags?: string[]
  }>()

  const db = c.env.DB
  const existing = await db.prepare('SELECT id FROM bookmarks WHERE id = ?1').bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const fields: string[] = []
  const params: unknown[] = []

  if (body.title !== undefined) { fields.push(`title = ?${params.length + 1}`); params.push(body.title) }
  if (body.description !== undefined) { fields.push(`description = ?${params.length + 1}`); params.push(body.description) }
  if (body.cover_url !== undefined) { fields.push(`cover_url = ?${params.length + 1}`); params.push(body.cover_url) }
  if (body.collection_id !== undefined) { fields.push(`collection_id = ?${params.length + 1}`); params.push(body.collection_id) }
  if (body.is_favorite !== undefined) { fields.push(`is_favorite = ?${params.length + 1}`); params.push(body.is_favorite ? 1 : 0) }

  if (fields.length) {
    fields.push(`updated_at = unixepoch()`)
    await db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?${params.length + 1}`)
      .bind(...params, id).run()
  }

  if (body.tags !== undefined) {
    await db.prepare('DELETE FROM bookmark_tags WHERE bookmark_id = ?1').bind(id).run()
    if (body.tags.length) await upsertTags(db, id, body.tags)
  }

  const row = await db.prepare(
    `SELECT b.*, GROUP_CONCAT(t.name) AS tags
     FROM bookmarks b
     LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
     LEFT JOIN tags t ON t.id = bt.tag_id
     WHERE b.id = ?1 GROUP BY b.id`
  ).bind(id).first()

  return c.json(normalizeRow(row!))
})

// DELETE /api/bookmarks/:id
bookmarksRouter.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare('SELECT id FROM bookmarks WHERE id = ?1').bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare('DELETE FROM bookmarks WHERE id = ?1').bind(id).run()
  return c.json({ ok: true })
})

async function upsertTags(db: D1Database, bookmarkId: string, tagNames: string[]) {
  for (const name of tagNames) {
    const normalized = name.trim().toLowerCase()
    if (!normalized) continue
    const tagId = crypto.randomUUID()
    await db.prepare(
      `INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING`
    ).bind(tagId, normalized).run()
    const tag = await db.prepare('SELECT id FROM tags WHERE name = ?1').bind(normalized).first<{ id: string }>()
    if (tag) {
      await db.prepare(
        `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING`
      ).bind(bookmarkId, tag.id).run()
    }
  }
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    is_favorite: row['is_favorite'] === 1,
    tags: row['tags'] ? String(row['tags']).split(',').filter(Boolean) : [],
  }
}
