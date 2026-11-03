import { Hono } from 'hono'
import type { Env } from '../index'

export const collectionsRouter = new Hono<{ Bindings: Env }>()

// GET /api/collections
collectionsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT c.*, COUNT(b.id) AS bookmark_count
     FROM collections c
     LEFT JOIN bookmarks b ON b.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`
  ).all()
  return c.json(rows.results)
})

// GET /api/collections/:id
collectionsRouter.get('/:id', async (c) => {
  const { id } = c.req.param()
  const row = await c.env.DB.prepare(
    `SELECT c.*, COUNT(b.id) AS bookmark_count
     FROM collections c
     LEFT JOIN bookmarks b ON b.collection_id = c.id
     WHERE c.id = ?1
     GROUP BY c.id`
  ).bind(id).first()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

// POST /api/collections
collectionsRouter.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    description?: string
    parent_id?: string
    color?: string
  }>()

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400)

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO collections (id, name, description, parent_id, color)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(id, body.name.trim(), body.description ?? '', body.parent_id ?? null, body.color ?? '').run()

  const row = await c.env.DB.prepare('SELECT * FROM collections WHERE id = ?1').bind(id).first()
  return c.json(row, 201)
})

// PUT /api/collections/:id
collectionsRouter.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    name?: string
    description?: string
    parent_id?: string | null
    color?: string
  }>()

  const existing = await c.env.DB.prepare('SELECT id FROM collections WHERE id = ?1').bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const fields: string[] = []
  const params: unknown[] = []

  if (body.name !== undefined) { fields.push(`name = ?${params.length + 1}`); params.push(body.name.trim()) }
  if (body.description !== undefined) { fields.push(`description = ?${params.length + 1}`); params.push(body.description) }
  if (body.parent_id !== undefined) { fields.push(`parent_id = ?${params.length + 1}`); params.push(body.parent_id) }
  if (body.color !== undefined) { fields.push(`color = ?${params.length + 1}`); params.push(body.color) }

  if (fields.length) {
    fields.push(`updated_at = unixepoch()`)
    await c.env.DB.prepare(`UPDATE collections SET ${fields.join(', ')} WHERE id = ?${params.length + 1}`)
      .bind(...params, id).run()
  }

  const row = await c.env.DB.prepare('SELECT * FROM collections WHERE id = ?1').bind(id).first()
  return c.json(row)
})

// DELETE /api/collections/:id
collectionsRouter.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare('SELECT id FROM collections WHERE id = ?1').bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  // Bookmarks in this collection have their collection_id set to NULL by FK
  await c.env.DB.prepare('DELETE FROM collections WHERE id = ?1').bind(id).run()
  return c.json({ ok: true })
})
