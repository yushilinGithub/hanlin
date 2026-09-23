import { clip, getJson, intArg, stringArg, withQuery } from './http.js'
import type { SearchHit, SearchSource } from './types.js'

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

type ESearch = { esearchresult?: { idlist?: string[] } }

type ESummaryRecord = {
  title?: string
  pubdate?: string
  epubdate?: string
  fulljournalname?: string
  source?: string
  authors?: { name?: string }[]
}

type ESummary = { result?: { uids?: string[] } & Record<string, ESummaryRecord | string[] | undefined> }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** PubMed dates look like "2026 Aug 18", "2026 Oct" or "2026". Returns YYYY-MM-DD. */
export function parsePubmedDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4})(?:\s+([A-Za-z]{3})[A-Za-z]*)?(?:\s+(\d{1,2}))?/)
  if (!match) return undefined
  const month = match[2] ? MONTHS.indexOf(match[2].toLowerCase()) + 1 : 1
  const p = (n: number) => String(n).padStart(2, '0')
  return `${match[1]}-${p(month || 1)}-${p(match[3] ? Number(match[3]) : 1)}`
}

function keyParam(): Record<string, string | undefined> {
  return { api_key: process.env.NCBI_API_KEY || undefined, tool: 'hanlin' }
}

export const pubmed: SearchSource = {
  name: 'pubmed_search',
  label: 'PubMed',
  description:
    'Peer-reviewed biomedical and clinical literature indexed by PubMed. Use for diseases, ' +
    'drugs, therapies, clinical study results, biology, and medical devices.',
  hosts: ['pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Keywords or PubMed syntax, e.g. "Alzheimer Disease"[MeSH] AND lecanemab, ' +
          'or "Obesity"[MeSH] AND tirzepatide.',
      },
      days: { type: 'integer', description: 'Only articles published in the last N days.' },
    },
    required: ['query'],
  },
  recentDays: 365,
  // Without an API key NCBI allows 3 requests per second; each search makes two.
  minIntervalMs: process.env.NCBI_API_KEY ? 0 : 700,
  isAvailable: () => true,
  async search(args, signal) {
    const query = stringArg(args.query)
    if (!query) return []
    const days = intArg(args.days)
    const found = await getJson<ESearch>(
      withQuery(`${EUTILS}/esearch.fcgi`, {
        db: 'pubmed',
        term: query,
        retmode: 'json',
        retmax: 8,
        sort: days ? 'pub_date' : 'relevance',
        reldate: days,
        datetype: days ? 'pdat' : undefined,
        ...keyParam(),
      }),
      signal,
    )
    const ids = found.esearchresult?.idlist ?? []
    if (ids.length === 0) return []

    const summary = await getJson<ESummary>(
      withQuery(`${EUTILS}/esummary.fcgi`, { db: 'pubmed', id: ids.join(','), retmode: 'json', ...keyParam() }),
      signal,
    )
    const hits: SearchHit[] = []
    for (const id of ids) {
      const record = summary.result?.[id] as ESummaryRecord | undefined
      if (!record?.title) continue
      const authors = (record.authors ?? []).map(a => a.name).filter(Boolean)
      const byline = authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ')
      hits.push({
        title: record.title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        published: parsePubmedDate(record.epubdate) ?? parsePubmedDate(record.pubdate),
        snippet: clip([record.fulljournalname ?? record.source, byline].filter(Boolean).join(' — ')),
      })
    }
    return hits
  },
}
