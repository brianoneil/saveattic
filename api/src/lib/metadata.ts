export interface PageMetadata {
  title: string
  description: string
  cover_url: string
}

export async function fetchMetadata(url: string): Promise<PageMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; saveattic/1.0; +https://saveattic.com)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return empty()

    const html = await response.text()
    return parse(html, url)
  } catch {
    return empty()
  }
}

function empty(): PageMetadata {
  return { title: '', description: '', cover_url: '' }
}

function parse(html: string, baseUrl: string): PageMetadata {
  const title = extractMeta(html, 'og:title') || extractTitle(html) || ''
  const description = extractMeta(html, 'og:description') || extractMeta(html, 'description') || ''
  const cover_raw = extractMeta(html, 'og:image') || ''
  const cover_url = resolveUrl(cover_raw, baseUrl)
  return { title: title.trim(), description: description.trim(), cover_url }
}

function extractMeta(html: string, name: string): string {
  // og: properties use property=, standard meta uses name=
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1])
  }
  return ''
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1] ? decodeHtmlEntities(m[1]) : ''
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

function resolveUrl(url: string, base: string): string {
  if (!url) return ''
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}
