import { findCompanyIn, loadStockList } from './cninfo.js'
import { clip, daysAgo, getText, intArg, stringArg, withQuery } from './http.js'
import { sinaLiveNews, sinaStockNews } from './sina.js'
import type { SearchHit, SearchSource } from './types.js'

type Article = {
  date?: string // "2026-09-22 14:54:43", Beijing time
  title?: string
  content?: string
  mediaName?: string
  url?: string
  code?: string
}

type SearchResponse = { result?: { cmsArticleWebOld?: Article[] } }

/** "2026-09-22 14:54:43" (Beijing) → ISO 8601 with offset. */
export function parseEastmoneyDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)
  return match ? `${match[1]}T${match[2]}+08:00` : undefined
}

// Words that say "recent news" rather than name a topic. They match unrelated stories
// (水贝金店…最新进展), and recency is handled by `days`.
const FILLER = /最新消息|最新进展|最新动态|最新情况|最新|消息|新闻|动态|资讯|进展/g

/** Drops filler words, keeping the query unchanged if nothing else would remain. */
export function topicQuery(query: string): string {
  const topic = query.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
  return topic || query
}

/** The endpoint answers JSONP; strip the callback wrapper. */
export function unwrapJsonp(text: string): unknown {
  return JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')))
}

// Eastmoney's news search, the endpoint behind so.eastmoney.com (also used by AkShare's
// stock_news_em). It is undocumented and the articles are copyrighted by their outlets.
export const eastmoney: SearchSource = {
  name: 'eastmoney_news',
  label: 'Eastmoney',
  description:
    'Chinese-language financial news from Eastmoney (东方财富), aggregating outlets such as ' +
    '中国证券报, 证券时报, 财联社, 新华财经 and 界面新闻. Use for news about Chinese companies, ' +
    'industries, markets, policy and the economy. Write the query in Chinese.',
  // sina.* is the fallback's results.
  hosts: ['eastmoney.com', 'sina.com.cn', 'sina.cn'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Chinese topic keywords: a company, industry or policy, e.g. "宁德时代", "固态电池", ' +
          '"央行 降准". Leave out words like 最新 or 消息; use days for recency.',
      },
      days: { type: 'integer', description: 'Only news from the last N days.' },
    },
    required: ['query'],
  },
  recentDays: 30,
  isAvailable: () => true,
  async search(args, signal) {
    const raw = stringArg(args.query)
    if (!raw) return []
    const query = topicQuery(raw)
    const days = intArg(args.days)

    let hits: SearchHit[]
    try {
      hits = await searchEastmoney(query, signal)
    } catch (error) {
      if (signal.aborted) throw error
      hits = await searchSina(query, signal).catch(fallbackError => {
        throw new Error(`${errorText(error)}; Sina fallback also failed: ${errorText(fallbackError)}`)
      })
    }
    const cutoff = days ? daysAgo(days).getTime() : undefined
    return hits.filter(h => !cutoff || !h.published || Date.parse(h.published) >= cutoff)
  },
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Fallback: Sina's per-stock news when the query names a listed company, otherwise the
 * Sina 7×24 feed filtered to the query's keywords (which reaches back only about an hour).
 */
async function searchSina(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const company = findCompanyIn(await loadStockList(signal), query)
  if (!company) return sinaLiveNews(query.split(/\s+/).filter(Boolean), signal)
  // The per-stock list has no keyword filter: put titles matching the rest of the query
  // (贵州茅台 分红 → 分红) first, keeping the others after them.
  const keywords = query.replace(company.zwjc, ' ').replace(company.code, ' ').split(/\s+/).filter(Boolean)
  const hits = await sinaStockNews(company.code, signal)
  const matches = (h: SearchHit) => keywords.some(k => h.title.includes(k))
  return [...hits.filter(matches), ...hits.filter(h => !matches(h))]
}

async function searchEastmoney(query: string, signal: AbortSignal): Promise<SearchHit[]> {
    const param = {
      uid: '',
      keyword: query,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          // Always relevance: sort "time" returns any recent article that mentions the
          // words at all. Relevance results are already recent; `days` filters below.
          sort: 'default',
          pageIndex: 1,
          pageSize: 10,
          preTag: '',
          postTag: '',
        },
      },
    }
    const text = await getText(
      withQuery('https://search-api-web.eastmoney.com/search/jsonp', { cb: 'cb', param: JSON.stringify(param) }),
      signal,
    )
    const articles = (unwrapJsonp(text) as SearchResponse).result?.cmsArticleWebOld ?? []

    const hits: SearchHit[] = []
    for (const a of articles) {
      const url = (a.url || (a.code ? `https://finance.eastmoney.com/a/${a.code}.html` : ''))
        .replace(/^http:/, 'https:')
      if (!a.title || !url) continue
      hits.push({
        title: a.title.replace(/<[^>]+>/g, ''),
        url,
        published: parseEastmoneyDate(a.date),
        snippet: clip([a.mediaName, a.content?.replace(/^[，。、\s]+/, '')].filter(Boolean).join(' — ')),
      })
    }
    return hits
}
