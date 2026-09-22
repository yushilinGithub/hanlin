import { DEFAULT_USER_AGENT, daysAgo, getJson, intArg, SourceHttpError, stringArg } from './http.js'
import type { SearchHit, SearchSource } from './types.js'

const BASE = 'https://www.cninfo.com.cn'

// cninfo announcement categories (from its disclosure search page). Several can be
// combined with ';'.
const REPORTS: Record<string, string> = {
  annual: 'category_ndbg_szsh', // 年报
  semiannual: 'category_bndbg_szsh', // 半年报
  q1: 'category_yjdbg_szsh', // 一季报
  q3: 'category_sjdbg_szsh', // 三季报
  periodic: 'category_ndbg_szsh;category_bndbg_szsh;category_yjdbg_szsh;category_sjdbg_szsh',
  earnings_forecast: 'category_yjygjxz_szsh', // 业绩预告
  dividend: 'category_qyfpxzcs_szsh', // 权益分派
  shareholder_meeting: 'category_gddh_szsh', // 股东大会
  risk_warning: 'category_fxts_szsh', // 风险提示
}

type StockEntry = { code: string; orgId: string; zwjc: string }

type Announcement = {
  secCode?: string
  secName?: string
  announcementTitle?: string
  announcementTime?: number
  adjunctUrl?: string
  adjunctSize?: number
}

type QueryResponse = { announcements?: Announcement[] | null }

// A-share code → orgId list (~6,000 companies, ~600 KB), fetched once per process and
// only when a search names a company.
let stockList: Promise<StockEntry[]> | undefined

export function loadStockList(signal: AbortSignal): Promise<StockEntry[]> {
  stockList ??= getJson<{ stockList?: StockEntry[] }>(`${BASE}/new/data/szse_stock.json`, signal)
    .then(res => res.stockList ?? [])
    .catch(error => {
      stockList = undefined
      throw error
    })
  return stockList
}

/** Matches a 6-digit code or the exact short name (宁德时代); otherwise undefined. */
export function findStock(list: StockEntry[], company: string): StockEntry | undefined {
  const c = company.trim()
  return list.find(s => s.code === c) ?? list.find(s => s.zwjc === c)
}

/** The company a free-text query mentions: a 6-digit code, or the longest short name it contains. */
export function findCompanyIn(list: StockEntry[], text: string): StockEntry | undefined {
  const code = text.match(/\b\d{6}\b/)?.[0]
  if (code) return list.find(s => s.code === code)
  let best: StockEntry | undefined
  for (const s of list) {
    // Two-character names (e.g. 万科) would match inside unrelated words.
    if (s.zwjc.length >= 3 && text.includes(s.zwjc) && s.zwjc.length > (best?.zwjc.length ?? 0)) best = s
  }
  return best
}

/** YYYY-MM-DD in Beijing time, the timezone cninfo dates and timestamps are in. */
export function beijingDate(d: Date): string {
  return new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

function toHits(announcements: Announcement[]): SearchHit[] {
  const hits: SearchHit[] = []
  for (const a of announcements) {
    if (!a.announcementTitle || !a.adjunctUrl) continue
    const title = a.announcementTitle.replace(/<[^>]+>/g, '')
    hits.push({
      title: `${a.secName ?? ''}(${a.secCode ?? ''})：${title}`,
      url: `https://static.cninfo.com.cn/${a.adjunctUrl}`,
      published: a.announcementTime ? beijingDate(new Date(a.announcementTime)) : undefined,
      snippet: `PDF${a.adjunctSize ? `, ${a.adjunctSize} KB` : ''}`,
    })
  }
  return hits
}

async function queryAnnouncements(form: Record<string, string>, signal: AbortSignal): Promise<Announcement[]> {
  const url = `${BASE}/new/hisAnnouncement/query`
  const res = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams(form),
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
    signal,
  })
  if (!res.ok) throw new SourceHttpError(res.status, url)
  return ((await res.json()) as QueryResponse).announcements ?? []
}

export const cninfo: SearchSource = {
  name: 'cninfo_announcements',
  label: 'cninfo',
  description:
    'Official announcements of Shanghai, Shenzhen and Beijing listed companies (A-shares) ' +
    'from cninfo (巨潮资讯网): annual, semi-annual and quarterly reports, earnings forecasts, ' +
    'dividends and other disclosures, as PDF links. Use for Chinese listed companies’ ' +
    'financial reports and official disclosures. Write company names and keywords in Chinese.',
  hosts: ['cninfo.com.cn', 'static.cninfo.com.cn'],
  parameters: {
    type: 'object',
    properties: {
      company: {
        type: 'string',
        description: 'Company short name in Chinese or 6-digit stock code, e.g. "宁德时代" or "300750".',
      },
      query: {
        type: 'string',
        description: 'Chinese keywords matched against announcement titles, e.g. "固态电池" or "回购".',
      },
      report: {
        type: 'string',
        enum: Object.keys(REPORTS),
        description: 'Only this kind of announcement. "periodic" is all annual, semi-annual and quarterly reports.',
      },
      days: { type: 'integer', description: 'Only announcements from the last N days. Default: 365.' },
    },
  },
  // No recentDays: results are newest first, and "最新年报" must still reach a report filed
  // months ago, which a 30-day window would cut off.
  isAvailable: () => true,
  async search(args, signal) {
    const company = stringArg(args.company)
    const query = stringArg(args.query)
    if (!company && !query) return []
    const days = intArg(args.days) ?? 365

    // A known company is filtered by its orgId; an unknown name falls back to title search.
    const stock = company ? findStock(await loadStockList(signal), company) : undefined
    const searchkey = [stock ? undefined : company, query].filter(Boolean).join(' ')

    const announcements = await queryAnnouncements(
      {
        pageNum: '1',
        pageSize: '10',
        column: 'szse', // covers SSE, SZSE and BSE listings
        tabName: 'fulltext',
        stock: stock ? `${stock.code},${stock.orgId}` : '',
        searchkey,
        category: REPORTS[stringArg(args.report) ?? ''] ?? '',
        seDate: `${beijingDate(daysAgo(days))}~${beijingDate(new Date())}`,
        isHLtitle: 'false',
      },
      signal,
    )
    return toHits(announcements)
  },
}
