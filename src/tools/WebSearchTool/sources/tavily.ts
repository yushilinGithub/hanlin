import { clip, intArg, SourceHttpError, stringArg } from './http.js'
import type { SearchSource } from './types.js'

type TavilyResult = { title?: string; url?: string; content?: string; published_date?: string }
type TavilyResponse = { results?: TavilyResult[] }

/** Tavily filters by named ranges, not a day count. */
export function timeRange(days: number | undefined): string | undefined {
  if (!days) return undefined
  if (days <= 1) return 'day'
  if (days <= 7) return 'week'
  if (days <= 31) return 'month'
  return 'year'
}

// General web search. In news mode every result carries a publish date; in web mode
// Tavily returns none, so news is the default.
export const tavily: SearchSource = {
  name: 'web_search',
  label: 'Tavily',
  description:
    'General web and news search (Tavily), in any language. Use only for topics the other ' +
    'tools do not cover: government policy and regulation, commodities, macroeconomics, ' +
    'official websites and documentation, or events outside finance and research.',
  hosts: [],
  linksOut: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query, e.g. "semiconductor export controls China".' },
      kind: {
        type: 'string',
        enum: ['news', 'web'],
        description: 'news: dated news articles (default). web: any web page, without dates.',
      },
      days: { type: 'integer', description: 'Only results from the last N days.' },
    },
    required: ['query'],
  },
  recentDays: 30,
  isAvailable: () => !!process.env.TAVILY_API_KEY,
  async search(args, signal) {
    const query = stringArg(args.query)
    if (!query) return []
    const url = 'https://api.tavily.com/search'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        topic: stringArg(args.kind) === 'web' ? 'general' : 'news',
        time_range: timeRange(intArg(args.days)),
        max_results: 8,
      }),
      signal,
    })
    if (!res.ok) throw new SourceHttpError(res.status, url)
    const data = (await res.json()) as TavilyResponse
    return (data.results ?? [])
      .filter(r => r.title && r.url)
      .map(r => {
        const time = r.published_date ? Date.parse(r.published_date) : Number.NaN
        return {
          title: r.title!,
          url: r.url!,
          published: Number.isNaN(time) ? undefined : new Date(time).toISOString(),
          snippet: clip(r.content),
        }
      })
  },
}
