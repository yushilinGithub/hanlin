export const DEFAULT_USER_AGENT = 'Mozilla/5.0'

export class SourceHttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(status === 429 ? `rate limited (HTTP 429) by ${new URL(url).host}` : `HTTP ${status} from ${new URL(url).host}`)
  }
}

async function request(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': DEFAULT_USER_AGENT, ...init.headers },
    signal,
  })
  if (!res.ok) throw new SourceHttpError(res.status, url)
  return res
}

export async function getJson<T>(url: string, signal: AbortSignal, headers?: HeadersInit): Promise<T> {
  const res = await request(url, { headers }, signal)
  return (await res.json()) as T
}

export async function postJson<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const res = await request(
    url,
    { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
    signal,
  )
  return (await res.json()) as T
}

export async function getText(url: string, signal: AbortSignal): Promise<string> {
  const res = await request(url, {}, signal)
  return res.text()
}

export function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export function clip(text: string | undefined, max = 400): string | undefined {
  if (!text) return undefined
  const flat = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Reads an integer argument the model may send as a number or a numeric string. */
export function intArg(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

export function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}
