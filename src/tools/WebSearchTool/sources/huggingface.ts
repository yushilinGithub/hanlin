import { clip, daysAgo, getJson, intArg, stringArg, withQuery } from './http.js'
import type { SearchHit, SearchSource } from './types.js'

type HFModel = {
  id?: string
  createdAt?: string
  likes?: number
  downloads?: number
  pipeline_tag?: string
}

type HFPaper = {
  paper?: { id?: string; title?: string; publishedAt?: string }
  title?: string
  summary?: string
  publishedAt?: string
}

function authHeaders(): HeadersInit | undefined {
  const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

async function searchModels(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const models = await getJson<HFModel[]>(
    withQuery('https://huggingface.co/api/models', { search: query, sort: 'trendingScore', limit: 6 }),
    signal,
    authHeaders(),
  )
  return models
    .filter(m => m.id)
    .map(m => ({
      title: `Model: ${m.id}`,
      url: `https://huggingface.co/${m.id}`,
      published: m.createdAt,
      snippet: [m.pipeline_tag, `${m.likes ?? 0} likes`, `${m.downloads ?? 0} downloads`]
        .filter(Boolean)
        .join(' · '),
    }))
}

async function searchPapers(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const papers = await getJson<HFPaper[]>(
    withQuery('https://huggingface.co/api/papers/search', { q: query, limit: 6 }),
    signal,
    authHeaders(),
  )
  return papers
    .filter(p => p.paper?.id)
    .map(p => ({
      title: `Paper: ${(p.title ?? p.paper?.title ?? '').replace(/\s+/g, ' ').trim()}`,
      url: `https://huggingface.co/papers/${p.paper!.id}`,
      published: p.publishedAt ?? p.paper?.publishedAt,
      snippet: clip(p.summary),
    }))
}

export const huggingface: SearchSource = {
  name: 'huggingface_search',
  label: 'Hugging Face',
  description:
    'AI models and AI research papers on the Hugging Face Hub. Use for a named AI model, ' +
    'model family or open-weights release, and for recent AI papers the community is discussing.',
  hosts: ['huggingface.co'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'For models: a name fragment matched against repository ids, e.g. "qwen3" or ' +
          '"deepseek-v4", not a sentence. For papers: keywords.',
      },
      kind: {
        type: 'string',
        enum: ['models', 'papers', 'both'],
        description: 'What to search. Default: both.',
      },
      days: { type: 'integer', description: 'Only models or papers from the last N days.' },
    },
    required: ['query'],
  },
  recentDays: 365,
  isAvailable: () => true,
  async search(args, signal) {
    const query = stringArg(args.query)
    if (!query) return []
    const kind = stringArg(args.kind) ?? 'both'
    const days = intArg(args.days)
    const [models, papers] = await Promise.all([
      kind === 'papers' ? [] : searchModels(query, signal),
      kind === 'models' ? [] : searchPapers(query, signal),
    ])
    const cutoff = days ? daysAgo(days).getTime() : undefined
    return [...models, ...papers].filter(h => !cutoff || !h.published || Date.parse(h.published) >= cutoff)
  },
}
