import { clip, daysAgo, getJson, intArg, stringArg, withQuery } from './http.js'
import type { SearchHit, SearchSource } from './types.js'

// OpenAlex publisher ids, for restricting a search to one publisher's journals and
// conferences. Add entries here to offer more publishers to the model.
const PUBLISHERS: Record<string, string> = {
  ieee: 'P4310319808',
}

type OpenAlexWork = {
  id?: string
  doi?: string | null
  title?: string | null
  publication_date?: string
  cited_by_count?: number
  primary_location?: {
    landing_page_url?: string | null
    source?: { display_name?: string | null } | null
  } | null
  authorships?: { author?: { display_name?: string } }[]
  abstract_inverted_index?: Record<string, number[]> | null
}

type OpenAlexResponse = { results?: OpenAlexWork[] }

/** OpenAlex stores abstracts as word → positions; rebuild the leading text. */
export function rebuildAbstract(index: Record<string, number[]> | null | undefined, maxWords = 80): string | undefined {
  if (!index) return undefined
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) if (p < maxWords) words[p] = word
  }
  const text = words.filter(Boolean).join(' ')
  return text || undefined
}

function toHit(work: OpenAlexWork): SearchHit | undefined {
  const url = work.primary_location?.landing_page_url ?? work.doi ?? work.id
  if (!work.title || !url) return undefined
  const authors = (work.authorships ?? []).map(a => a.author?.display_name).filter(Boolean)
  const byline = authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ')
  const venue = work.primary_location?.source?.display_name
  const meta = [venue, byline, `${work.cited_by_count ?? 0} citations`].filter(Boolean).join(' · ')
  return {
    title: work.title,
    url,
    published: work.publication_date,
    snippet: clip([meta, rebuildAbstract(work.abstract_inverted_index)].filter(Boolean).join(' — ')),
  }
}

export const openalex: SearchSource = {
  name: 'openalex_search',
  label: 'OpenAlex',
  description:
    'Peer-reviewed journal and conference papers from all publishers (IEEE, Elsevier, ' +
    'Springer, Nature, medical journals), with citation counts. Use for published research ' +
    'in engineering, semiconductors, chips, materials, medicine and science, especially ' +
    'work that is not on arXiv, such as IEEE conference papers.',
  hosts: ['openalex.org', 'doi.org'],
  // Results link to publisher sites (ieeexplore.ieee.org, sciencedirect.com, …).
  linksOut: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords, e.g. "gate-all-around transistor".' },
      publisher: {
        type: 'string',
        enum: Object.keys(PUBLISHERS),
        description:
          'Only this publisher. Set it when the query names one (e.g. IEEE). For chip and ' +
          'semiconductor device research, "ieee" usually gives the most relevant papers.',
      },
      days: { type: 'integer', description: 'Only papers published in the last N days.' },
    },
    required: ['query'],
  },
  recentDays: 365,
  isAvailable: () => true,
  async search(args, signal) {
    const query = stringArg(args.query)
    if (!query) return []
    const days = intArg(args.days)
    const publisher = PUBLISHERS[stringArg(args.publisher)?.toLowerCase() ?? '']
    const filters = [
      // Title and abstract only: the default full-text search matches papers that merely
      // mention the terms. Commas separate filters, so they cannot appear in the query.
      `title_and_abstract.search:${query.replace(/,/g, ' ')}`,
      // Journals and conferences only: repositories (Zenodo, arXiv) are unreviewed and
      // duplicate the arXiv source.
      'primary_location.source.type:journal|conference',
      days ? `from_publication_date:${daysAgo(days).toISOString().slice(0, 10)}` : undefined,
      publisher ? `primary_location.source.host_organization:${publisher}` : undefined,
    ].filter(Boolean)

    const res = await getJson<OpenAlexResponse>(
      withQuery('https://api.openalex.org/works', {
        filter: filters.join(','),
        'per-page': 10,
        select: 'id,doi,title,publication_date,cited_by_count,primary_location,authorships,abstract_inverted_index',
        // Requests with a contact address go to OpenAlex's faster, more reliable pool.
        mailto: process.env.OPENALEX_EMAIL || undefined,
      }),
      signal,
    )

    // The same paper is often registered under several DOIs; keep the first of each title.
    const seen = new Set<string>()
    const hits: SearchHit[] = []
    for (const work of res.results ?? []) {
      const hit = toHit(work)
      const key = hit?.title.toLowerCase().replace(/\W+/g, ' ').trim()
      if (!hit || !key || seen.has(key)) continue
      seen.add(key)
      hits.push(hit)
    }
    return hits
  },
}
