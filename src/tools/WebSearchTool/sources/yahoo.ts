import { clip, daysAgo, getJson, intArg, postJson, stringArg, withQuery } from './http.js'
import type { SearchHit, SearchSource } from './types.js'

type YahooSearchResponse = {
  quotes?: { symbol?: string; quoteType?: string }[]
  news?: { title?: string; link?: string; providerPublishTime?: number; publisher?: string }[]
}

type YahooStreamItem = {
  content?: {
    title?: string
    summary?: string
    pubDate?: string
    canonicalUrl?: { url?: string }
    clickThroughUrl?: { url?: string }
    provider?: { displayName?: string }
  }
}

type YahooStreamResponse = { data?: { tickerStream?: { stream?: YahooStreamItem[] } } }

const TICKER_QUOTE_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CRYPTOCURRENCY'])

async function keywordSearch(
  query: string,
  signal: AbortSignal,
): Promise<{ tickers: string[]; hits: SearchHit[] }> {
  const res = await getJson<YahooSearchResponse>(
    withQuery('https://query2.finance.yahoo.com/v1/finance/search', { q: query, newsCount: 6, quotesCount: 3 }),
    signal,
  )
  const tickers = (res.quotes ?? [])
    .filter(q => q.symbol && TICKER_QUOTE_TYPES.has(q.quoteType ?? ''))
    .map(q => q.symbol as string)
  const hits = (res.news ?? [])
    .filter(n => n.title && n.link)
    .map(n => ({
      title: n.title!,
      url: n.link!,
      published: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : undefined,
      snippet: n.publisher,
    }))
  return { tickers, hits }
}

async function tickerNews(tickers: string[], signal: AbortSignal): Promise<SearchHit[]> {
  const res = await postJson<YahooStreamResponse>(
    'https://finance.yahoo.com/xhr/ncp?queryRef=latestNews&serviceKey=ncp_fin',
    { serviceConfig: { snippetCount: 10, s: tickers } },
    signal,
  )
  const hits: SearchHit[] = []
  for (const item of res.data?.tickerStream?.stream ?? []) {
    const c = item.content
    const url = c?.canonicalUrl?.url ?? c?.clickThroughUrl?.url
    if (!c?.title || !url) continue
    hits.push({
      title: c.title,
      url,
      published: c.pubDate,
      snippet: clip([c.provider?.displayName, c.summary].filter(Boolean).join(' — ')),
    })
  }
  return hits
}

function tickerArg(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim().toUpperCase())
}

// Keyword search ranks news loosely (a query for "nvidia" can lead with unrelated stories),
// while per-ticker news is accurate and dated. Keywords are therefore resolved to tickers
// first; keyword news only fills in behind the ticker news.
export const yahoo: SearchSource = {
  name: 'yahoo_finance_news',
  label: 'Yahoo Finance',
  description:
    'Recent financial news for public companies, ETFs and markets from Yahoo Finance. ' +
    'Use for company news, earnings, deals, stock moves, and market reaction to events.',
  hosts: ['finance.yahoo.com', 'yahoo.com'],
  parameters: {
    type: 'object',
    properties: {
      tickers: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Stock tickers when known, e.g. ["NVDA", "TSM"]. Best results. Chinese and Hong Kong ' +
          'companies use exchange suffixes: 300750.SZ, 600519.SS, 0700.HK.',
      },
      query: {
        type: 'string',
        description:
          'Short company name or keywords, used to find tickers when none are given, e.g. ' +
          '"CATL", not the full legal name.',
      },
      days: { type: 'integer', description: 'Only news from the last N days.' },
    },
  },
  recentDays: 30,
  isAvailable: () => true,
  async search(args, signal) {
    const query = stringArg(args.query)
    const days = intArg(args.days)
    let tickers = tickerArg(args.tickers)

    let keywordHits: SearchHit[] = []
    if (query) {
      const found = await keywordSearch(query, signal)
      keywordHits = found.hits
      if (tickers.length === 0) tickers = found.tickers.slice(0, 2)
    }
    const hits = [...(tickers.length > 0 ? await tickerNews(tickers.slice(0, 3), signal) : []), ...keywordHits]

    const cutoff = days ? daysAgo(days).getTime() : undefined
    const seen = new Set<string>()
    return hits.filter(h => {
      if (seen.has(h.url)) return false
      seen.add(h.url)
      return !cutoff || !h.published || Date.parse(h.published) >= cutoff
    })
  },
}
