/**
 * Sina Finance news, used as the fallback when the Eastmoney news search fails. These
 * are the endpoints AkShare uses; neither is a search API, so each covers only part of
 * what a keyword search does:
 * - per-stock news list: recent news for one A-share company, by stock code
 * - 7×24 live feed: the latest flash news on every topic (about the last hour), filtered
 *   here to items that contain the query's keywords
 */
import { DEFAULT_USER_AGENT, SourceHttpError, clip, getJson } from './http.js'
import type { SearchHit } from './types.js'

/** Sina symbol prefix: sh for Shanghai (6…), bj for Beijing (4…, 8…, 92…), else sz. */
export function sinaSymbol(code: string): string {
  if (code.startsWith('6')) return `sh${code}`
  if (/^(4|8|92)/.test(code)) return `bj${code}`
  return `sz${code}`
}

/** Parses the per-stock news page (GBK HTML) into hits, skipping auto-generated price blurbs. */
export function parseStockNewsPage(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const rows = html.matchAll(/(\d{4}-\d{2}-\d{2})&nbsp;(\d{2}:\d{2})&nbsp;&nbsp;<a[^>]*href=['"]([^'"]+)['"][^>]*>(.*?)<\/a>/g)
  for (const [, date, time, url, title] of rows) {
    // /aiassist/ pages are machine-written "X fell 1.5%" notes, often about other stocks.
    if (!url || !title || url.includes('/aiassist/')) continue
    hits.push({
      title: title.replace(/<[^>]+>/g, '').trim(),
      url: url.replace(/^http:/, 'https:'),
      published: `${date}T${time}:00+08:00`,
      snippet: '新浪财经',
    })
  }
  return hits
}

export async function sinaStockNews(code: string, signal: AbortSignal): Promise<SearchHit[]> {
  const url = `https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllNewsStock/symbol/${sinaSymbol(code)}.phtml`
  const res = await fetch(url, { headers: { 'User-Agent': DEFAULT_USER_AGENT }, signal })
  if (!res.ok) throw new SourceHttpError(res.status, url)
  // The page is GBK and says so in Content-Type; honor whatever charset it declares.
  const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'gbk'
  return parseStockNewsPage(new TextDecoder(charset).decode(await res.arrayBuffer()))
}

type LiveItem = { rich_text?: string; create_time?: string; docurl?: string }
type LiveResponse = { result?: { data?: { feed?: { list?: LiveItem[] } } } }

/** Latest 7×24 items whose text contains every keyword. */
export async function sinaLiveNews(keywords: string[], signal: AbortSignal): Promise<SearchHit[]> {
  const res = await getJson<LiveResponse>(
    'https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=100&zhibo_id=152&tag_id=0&dire=f&dpc=1&type=1',
    signal,
  )
  const hits: SearchHit[] = []
  for (const item of res.result?.data?.feed?.list ?? []) {
    const text = item.rich_text?.replace(/<[^>]+>/g, '').trim()
    if (!text || !item.docurl || !keywords.every(k => text.includes(k))) continue
    // Items read "【headline】body"; use the headline as the title when there is one.
    const headline = text.match(/^【(.+?)】/)?.[1]
    hits.push({
      title: headline ?? clip(text, 80)!,
      url: item.docurl,
      published: item.create_time ? `${item.create_time.replace(' ', 'T')}+08:00` : undefined,
      snippet: clip(`新浪财经 7×24 — ${text}`),
    })
  }
  return hits
}
