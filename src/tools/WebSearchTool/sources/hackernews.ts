import { daysAgo, getJson, intArg, stringArg, withQuery } from './http.js'
import type { SearchSource } from './types.js'

type HNResponse = {
  hits?: {
    objectID?: string
    title?: string
    url?: string | null
    created_at?: string
    points?: number
    num_comments?: number
  }[]
}

export const hackernews: SearchSource = {
  name: 'hackernews_search',
  label: 'Hacker News',
  description:
    'Technology news and launch discussion on Hacker News, linking to the original articles. ' +
    'Use for product launches, new AI models and tools, tech company news, and developer reaction.',
  hosts: ['news.ycombinator.com'],
  linksOut: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords, e.g. a product, model or company name.' },
      days: { type: 'integer', description: 'Only stories from the last N days; results sorted newest first.' },
    },
    required: ['query'],
  },
  recentDays: 30,
  isAvailable: () => true,
  async search(args, signal) {
    const query = stringArg(args.query)
    if (!query) return []
    const days = intArg(args.days)
    const res = await getJson<HNResponse>(
      withQuery(`https://hn.algolia.com/api/v1/${days ? 'search_by_date' : 'search'}`, {
        query,
        tags: 'story',
        hitsPerPage: 8,
        numericFilters: days ? `created_at_i>${Math.floor(daysAgo(days).getTime() / 1000)}` : undefined,
      }),
      signal,
    )
    return (res.hits ?? [])
      .filter(h => h.title && h.objectID)
      .map(h => {
        const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`
        return {
          title: h.title!,
          url: h.url || discussion,
          published: h.created_at,
          snippet: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments · discussion: ${discussion}`,
        }
      })
  },
}
