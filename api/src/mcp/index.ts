import type { Env } from '../index'
import { fetchMetadata } from '../lib/metadata'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number | null
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

function ok(id: string | number | null, result: unknown): Response {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id, result }
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

function err(id: string | number | null, code: number, message: string): Response {
  const body: JsonRpcResponse = { jsonrpc: '2.0', id, error: { code, message } }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const TOOLS = [
  {
    name: 'save_bookmark',
    description: 'Save a URL as a bookmark. Auto-fetches title and description if not provided.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to save' },
        title: { type: 'string', description: 'Optional title override' },
        description: { type: 'string', description: 'Optional description override' },
        collection_name: { type: 'string', description: 'Collection name to save into' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to apply' },
        is_favorite: { type: 'boolean', description: 'Mark as favorite' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_bookmarks',
    description: 'Full-text search across bookmark titles, descriptions, and URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_bookmarks',
    description: 'List bookmarks, optionally filtered by collection or tag.',
    inputSchema: {
      type: 'object',
      properties: {
        collection_name: { type: 'string', description: 'Filter by collection name' },
        tag: { type: 'string', description: 'Filter by tag name' },
        favorite: { type: 'boolean', description: 'Only return favorites' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'list_collections',
    description: 'List all bookmark collections.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tag_bookmark',
    description: 'Add tags to an existing bookmark.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmark_id: { type: 'string', description: 'Bookmark ID' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
      },
      required: ['bookmark_id', 'tags'],
    },
  },
  {
    name: 'move_bookmark',
    description: 'Move a bookmark to a different collection.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmark_id: { type: 'string', description: 'Bookmark ID' },
        collection_name: { type: 'string', description: 'Target collection name (or null to remove from collection)' },
      },
      required: ['bookmark_id'],
    },
  },
  {
    name: 'delete_bookmark',
    description: 'Delete a bookmark by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        bookmark_id: { type: 'string', description: 'Bookmark ID to delete' },
      },
      required: ['bookmark_id'],
    },
  },
]

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    return new Response(JSON.stringify({ name: 'saveattic-mcp', version: '1.0.0', tools: TOOLS.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let req: JsonRpcRequest
  try {
    req = await request.json() as JsonRpcRequest
  } catch {
    return err(null, -32700, 'Parse error')
  }

  const { id, method, params } = req

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'saveattic', version: '1.0.0' },
      })

    case 'ping':
      return ok(id, {})

    case 'tools/list':
      return ok(id, { tools: TOOLS })

    case 'tools/call':
      return callTool(id, params as { name: string; arguments?: Record<string, unknown> }, env)

    default:
      return err(id, -32601, `Method not found: ${method}`)
  }
}

async function callTool(
  id: string | number | null,
  params: { name: string; arguments?: Record<string, unknown> },
  env: Env
): Promise<Response> {
  const args = params.arguments ?? {}
  const db = env.DB

  try {
    switch (params.name) {
      case 'save_bookmark': {
        const url = args['url'] as string
        if (!url) return err(id, -32602, 'url is required')

        let title = (args['title'] as string) ?? ''
        let description = (args['description'] as string) ?? ''
        let coverUrl = ''

        if (!title) {
          const meta = await fetchMetadata(url)
          title = meta.title
          description = description || meta.description
          coverUrl = meta.cover_url
        }

        let collectionId: string | null = null
        if (args['collection_name']) {
          const col = await db.prepare('SELECT id FROM collections WHERE name = ?1').bind(args['collection_name']).first<{ id: string }>()
          collectionId = col?.id ?? null
        }

        const bmId = crypto.randomUUID()
        await db.prepare(
          `INSERT INTO bookmarks (id, url, title, description, cover_url, collection_id, is_favorite)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        ).bind(bmId, url, title, description, coverUrl, collectionId, args['is_favorite'] ? 1 : 0).run()

        const tags = args['tags'] as string[] | undefined
        if (tags?.length) await upsertTags(db, bmId, tags)

        return ok(id, { content: [{ type: 'text', text: `Saved: ${title || url} (id: ${bmId})` }] })
      }

      case 'search_bookmarks': {
        const query = args['query'] as string
        if (!query) return err(id, -32602, 'query is required')
        const limit = Number(args['limit'] ?? 20)

        const rows = await db.prepare(
          `SELECT b.id, b.url, b.title, b.description, b.collection_id, b.is_favorite, b.created_at,
                  GROUP_CONCAT(t.name) AS tags
           FROM bookmarks_fts f
           JOIN bookmarks b ON b.rowid = f.rowid
           LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
           LEFT JOIN tags t ON t.id = bt.tag_id
           WHERE bookmarks_fts MATCH ?1
           GROUP BY b.id
           ORDER BY b.created_at DESC
           LIMIT ?2`
        ).bind(query, limit).all()

        const results = rows.results.map(r => ({
          ...r,
          is_favorite: r['is_favorite'] === 1,
          tags: r['tags'] ? String(r['tags']).split(',') : [],
        }))

        return ok(id, { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] })
      }

      case 'get_bookmarks': {
        const limit = Number(args['limit'] ?? 20)
        const offset = Number(args['offset'] ?? 0)
        const params: unknown[] = []
        const where: string[] = []
        let tagJoin = ''

        if (args['collection_name']) {
          const col = await db.prepare('SELECT id FROM collections WHERE name = ?1').bind(args['collection_name']).first<{ id: string }>()
          if (col) { where.push(`b.collection_id = ?${params.length + 1}`); params.push(col.id) }
        }
        if (args['favorite']) { where.push('b.is_favorite = 1') }
        if (args['tag']) {
          tagJoin = ` JOIN bookmark_tags bt2 ON bt2.bookmark_id = b.id JOIN tags t2 ON t2.id = bt2.tag_id AND t2.name = ?${params.length + 1}`
          params.push(args['tag'])
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const sql = `
          SELECT b.id, b.url, b.title, b.description, b.collection_id, b.is_favorite, b.created_at,
                 GROUP_CONCAT(t.name) AS tags
          FROM bookmarks b
          LEFT JOIN bookmark_tags bt ON bt.bookmark_id = b.id
          LEFT JOIN tags t ON t.id = bt.tag_id
          ${tagJoin}
          ${whereSql}
          GROUP BY b.id
          ORDER BY b.created_at DESC
          LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}
        `
        params.push(limit, offset)

        const rows = await db.prepare(sql).bind(...params).all()
        const results = rows.results.map(r => ({
          ...r,
          is_favorite: r['is_favorite'] === 1,
          tags: r['tags'] ? String(r['tags']).split(',') : [],
        }))

        return ok(id, { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] })
      }

      case 'list_collections': {
        const rows = await db.prepare(
          `SELECT c.id, c.name, c.description, COUNT(b.id) AS bookmark_count
           FROM collections c
           LEFT JOIN bookmarks b ON b.collection_id = c.id
           GROUP BY c.id ORDER BY c.name ASC`
        ).all()
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(rows.results, null, 2) }] })
      }

      case 'tag_bookmark': {
        const bmId = args['bookmark_id'] as string
        const tags = args['tags'] as string[]
        if (!bmId || !tags?.length) return err(id, -32602, 'bookmark_id and tags required')
        const existing = await db.prepare('SELECT id FROM bookmarks WHERE id = ?1').bind(bmId).first()
        if (!existing) return err(id, -32602, `Bookmark ${bmId} not found`)
        await upsertTags(db, bmId, tags)
        return ok(id, { content: [{ type: 'text', text: `Added tags: ${tags.join(', ')}` }] })
      }

      case 'move_bookmark': {
        const bmId = args['bookmark_id'] as string
        if (!bmId) return err(id, -32602, 'bookmark_id required')

        let collectionId: string | null = null
        if (args['collection_name']) {
          const col = await db.prepare('SELECT id FROM collections WHERE name = ?1').bind(args['collection_name']).first<{ id: string }>()
          if (!col) return err(id, -32602, `Collection "${args['collection_name']}" not found`)
          collectionId = col.id
        }

        await db.prepare('UPDATE bookmarks SET collection_id = ?1, updated_at = unixepoch() WHERE id = ?2')
          .bind(collectionId, bmId).run()
        return ok(id, { content: [{ type: 'text', text: `Moved bookmark ${bmId}` }] })
      }

      case 'delete_bookmark': {
        const bmId = args['bookmark_id'] as string
        if (!bmId) return err(id, -32602, 'bookmark_id required')
        await db.prepare('DELETE FROM bookmarks WHERE id = ?1').bind(bmId).run()
        return ok(id, { content: [{ type: 'text', text: `Deleted bookmark ${bmId}` }] })
      }

      default:
        return err(id, -32601, `Unknown tool: ${params.name}`)
    }
  } catch (e) {
    return err(id, -32603, `Internal error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function upsertTags(db: D1Database, bookmarkId: string, tagNames: string[]) {
  for (const name of tagNames) {
    const normalized = name.trim().toLowerCase()
    if (!normalized) continue
    const tagId = crypto.randomUUID()
    await db.prepare('INSERT INTO tags (id, name) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING').bind(tagId, normalized).run()
    const tag = await db.prepare('SELECT id FROM tags WHERE name = ?1').bind(normalized).first<{ id: string }>()
    if (tag) {
      await db.prepare('INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING')
        .bind(bookmarkId, tag.id).run()
    }
  }
}
