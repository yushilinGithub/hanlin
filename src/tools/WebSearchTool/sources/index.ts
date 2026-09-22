import { arxiv } from './arxiv.js'
import { cninfo } from './cninfo.js'
import { eastmoney } from './eastmoney.js'
import { hackernews } from './hackernews.js'
import { huggingface } from './huggingface.js'
import { openalex } from './openalex.js'
import { pubmed } from './pubmed.js'
import { tavily } from './tavily.js'
import type { SearchSource } from './types.js'
import { yahoo } from './yahoo.js'

/**
 * Every source WebSearch can route to on a non-Anthropic provider. Adding a source is
 * adding its file and listing it here; the router prompt never names sources.
 */
export const SOURCES: SearchSource[] = [
  yahoo,
  eastmoney,
  cninfo,
  arxiv,
  pubmed,
  openalex,
  huggingface,
  hackernews,
  // General web search; offered only when TAVILY_API_KEY is set, and also run
  // automatically when every other source comes back empty (see backupCall).
  tavily,
]
