import { Hono } from 'hono'
import type { Env } from '../index'

export const tagsRouter = new Hono<{ Bindings: Env }>()

// GET /api/tags
tagsRouter.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.*, COUNT(bt.bookmark_id) AS bookmark_count
     FROM tags t
     LEFT JOIN bookmark_tags bt ON bt.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.name ASC`
  ).all()
  return c.json(rows.results)
})

// DELETE /api/tags/:id  (removes tag from all bookmarks)
tagsRouter.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?1').bind(id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare('DELETE FROM tags WHERE id = ?1').bind(id).run()
  return c.json({ ok: true })
})
