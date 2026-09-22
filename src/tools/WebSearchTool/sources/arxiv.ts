import { clip, daysAgo, getText, intArg, stringArg, withQuery } from './http.js'
import type { SearchHit, SearchSource } from './types.js'

const FIELD_SYNTAX = /\b(ti|abs|au|cat|all|co|jr|id):/

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

function unescapeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, m => XML_ENTITIES[m] ?? m)
}

function tag(entry: string, name: string): string | undefined {
  const match = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return match ? unescapeXml(match[1]!).replace(/\s+/g, ' ').trim() : undefined
}

function arxivDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
}

// arXiv does not index stopwords, so `all:of` matches nothing and empties an AND query.
const STOPWORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'is', 'of', 'on', 'or', 'the', 'to', 'with'])

/**
 * Plain keywords become an AND of all: terms (quoted phrases kept whole, stopwords
 * dropped); field syntax passes through unchanged.
 */
export function buildArxivQuery(query: string, category?: string, days?: number): string {
  const terms = (query.match(/"[^"]+"|\S+/g) ?? []).filter(t => t.startsWith('"') || !STOPWORDS.has(t.toLowerCase()))
  const base = FIELD_SYNTAX.test(query) || terms.length === 0 ? query : terms.map(t => `all:${t}`).join(' AND ')
  const parts = [`(${base})`]
  if (category) parts.push(`cat:${category}`)
  if (days) parts.push(`submittedDate:[${arxivDate(daysAgo(days))} TO ${arxivDate(new Date())}]`)
  return parts.join(' AND ')
}

export function parseArxivFeed(xml: string): SearchHit[] {
  const hits: SearchHit[] = []
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = tag(entry!, 'id')
    const title = tag(entry!, 'title')
    if (!id || !title) continue
    const authors = [...entry!.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1]!.trim())
    const byline = authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ')
    hits.push({
      title,
      url: id.replace(/^http:/, 'https:'),
      published: tag(entry!, 'published'),
      snippet: clip([byline, tag(entry!, 'summary')].filter(Boolean).join(' — ')),
    })
  }
  return hits
}

export const arxiv: SearchSource = {
  name: 'arxiv_search',
  label: 'arXiv',
  description:
    'Research preprints on arXiv in AI and machine learning, computer science, chip ' +
    'architecture, physics and materials. Use for papers, new model architectures and ' +
    'methods, benchmark results, and semiconductor device or materials research.',
  hosts: ['arxiv.org'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Keywords, or arXiv field syntax: ti:, abs:, au:, all:, combined with AND/OR, ' +
          'e.g. ti:"mixture of experts" AND abs:inference.',
      },
      category: {
        type: 'string',
        description: 'Optional arXiv category, e.g. cs.AI, cs.LG, cs.CL, cs.AR, cond-mat.mtrl-sci.',
      },
      days: { type: 'integer', description: 'Only papers submitted in the last N days.' },
    },
    required: ['query'],
  },
  recentDays: 365,
  // arXiv asks clients to space API requests at least 3 seconds apart.
  minIntervalMs: 3000,
  isAvailable: () => true,
  async search(args, signal) {
    const query = stringArg(args.query)
    if (!query) return []
    const days = intArg(args.days)
    const xml = await getText(
      withQuery('https://export.arxiv.org/api/query', {
        search_query: buildArxivQuery(query, stringArg(args.category), days),
        sortBy: days ? 'submittedDate' : 'relevance',
        sortOrder: 'descending',
        max_results: 8,
      }),
      signal,
    )
    return parseArxivFeed(xml)
  },
}
