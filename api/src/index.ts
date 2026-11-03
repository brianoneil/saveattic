import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bookmarksRouter } from './routes/bookmarks'
import { collectionsRouter } from './routes/collections'
import { tagsRouter } from './routes/tags'
import { importRouter } from './routes/import'
import { handleMcp } from './mcp'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  CORS_ORIGIN: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
  return corsMiddleware(c, next)
})

app.route('/api/bookmarks', bookmarksRouter)
app.route('/api/collections', collectionsRouter)
app.route('/api/tags', tagsRouter)
app.route('/api/import', importRouter)

app.all('/mcp', (c) => handleMcp(c.req.raw, c.env))

app.get('/', (c) => c.json({ name: 'saveattic', version: '1.0.0', status: 'ok' }))

export default app
