import { readFileSync } from 'fs'
import { mkdir, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { logError } from '../log.js'
import { getClaudeConfigHomeDir, isEnvTruthy } from '../envUtils.js'

/**
 * The models.dev catalog: model metadata for every known provider.
 *
 * This is the same source opencode uses. It supplies the four things Hanlin otherwise
 * guesses at for a non-Claude model — context window, max output, pricing and whether the
 * model reasons — all of which silently fall back to Claude-shaped defaults without it.
 *
 * Resolution is deliberately non-blocking: reads come from a disk cache, and a refresh
 * runs in the background. A cold, offline install simply has no catalog and falls back to
 * whatever the user configured explicitly.
 */

const DEFAULT_URL = 'https://models.dev/api.json'
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export type CatalogModel = {
  id: string
  name?: string
  reasoning?: boolean
  tool_call?: boolean
  open_weights?: boolean
  release_date?: string
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
}

export type CatalogProvider = {
  id: string
  name?: string
  /** Base URL for the provider's OpenAI-compatible endpoint. */
  api?: string
  /** Env vars that conventionally hold this provider's API key. */
  env?: string[]
  /** The AI SDK package models.dev associates with the provider. */
  npm?: string
  models: Record<string, CatalogModel>
}

type Catalog = Record<string, CatalogProvider>

function cachePath(): string {
  return join(getClaudeConfigHomeDir(), 'cache', 'models-dev.json')
}

function catalogUrl(): string {
  return process.env.HANLIN_MODELS_URL?.trim() || DEFAULT_URL
}

let cached: Catalog | null | undefined
let refreshStarted = false

function readCache(): { catalog: Catalog; fetchedAt: number } | null {
  try {
    const raw = readFileSync(cachePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.catalog !== 'object') return null
    return { catalog: parsed.catalog as Catalog, fetchedAt: parsed.fetchedAt ?? 0 }
  } catch {
    return null
  }
}

async function writeCache(catalog: Catalog): Promise<void> {
  const path = cachePath()
  await mkdir(dirname(path), { recursive: true })
  // Write-then-rename so a concurrent reader never sees a half-written file.
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify({ fetchedAt: Date.now(), catalog }), 'utf-8')
  await rename(tmp, path)
}

/** Normalize the models.dev payload, which keys providers and models by id. */
function normalize(payload: unknown): Catalog {
  const out: Catalog = {}
  if (!payload || typeof payload !== 'object') return out
  for (const [providerId, value] of Object.entries(payload as Record<string, any>)) {
    if (!value || typeof value !== 'object') continue
    const models: Record<string, CatalogModel> = {}
    for (const [modelId, model] of Object.entries((value.models ?? {}) as Record<string, any>)) {
      if (!model || typeof model !== 'object') continue
      models[modelId] = {
        id: model.id ?? modelId,
        name: model.name,
        reasoning: model.reasoning,
        tool_call: model.tool_call,
        open_weights: model.open_weights,
        release_date: model.release_date,
        limit: model.limit,
        cost: model.cost,
      }
    }
    out[providerId] = {
      id: value.id ?? providerId,
      name: value.name,
      api: value.api,
      env: Array.isArray(value.env) ? value.env : undefined,
      npm: value.npm,
      models,
    }
  }
  return out
}

async function refresh(): Promise<void> {
  try {
    const response = await fetch(catalogUrl(), { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return
    const catalog = normalize(await response.json())
    if (Object.keys(catalog).length === 0) return
    // Held in memory before the write: a read-only HOME or a full disk must not throw
    // away a fetch that already succeeded, or the picker shows no providers all session.
    cached = catalog
    await writeCache(catalog)
  } catch (error) {
    // A missing catalog degrades the picker; it must never break a session.
    logError(error as Error)
  }
}

/**
 * The catalog as of the last successful fetch, or an empty object.
 *
 * Synchronous by design — it is read from `getContextWindowForModel` and the model picker,
 * neither of which can await. A stale or absent catalog triggers a background refresh.
 */
export function getCatalog(): Catalog {
  if (cached === undefined) {
    const entry = readCache()
    cached = entry?.catalog ?? null
    if (!entry || Date.now() - entry.fetchedAt > REFRESH_INTERVAL_MS) {
      startRefresh()
    }
  }
  return cached ?? {}
}

export function startRefresh(): void {
  if (refreshStarted) return
  if (isEnvTruthy(process.env.HANLIN_DISABLE_MODELS_FETCH)) return
  refreshStarted = true
  void refresh()
}

export function getCatalogProvider(providerId: string): CatalogProvider | undefined {
  return getCatalog()[providerId]
}

export function getCatalogModel(providerId: string, modelId: string): CatalogModel | undefined {
  return getCatalog()[providerId]?.models[modelId]
}

/** Force a synchronous refresh. Only used by `/model --refresh`. */
export async function refreshCatalog(): Promise<void> {
  refreshStarted = true
  await refresh()
}
