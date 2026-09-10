# Model providers

finWorker runs on Anthropic's Claude models by default, and can be pointed at any
OpenAI-compatible endpoint instead — self-hosted (vLLM, SGLang, LM Studio, Ollama) or
hosted (DeepSeek, OpenRouter, Together, Groq, Fireworks, DashScope, Zhipu, Moonshot).

## Configuring a provider

Set `FINWORKER_PROVIDER` to select one. Anthropic remains the default when it is unset.

```bash
# Local Ollama — no API key needed
FINWORKER_PROVIDER=ollama finworker -p "explain this repo"

# Any OpenAI-compatible server (vLLM, SGLang, LM Studio, …)
FINWORKER_PROVIDER=openai-compatible \
FINWORKER_BASE_URL=http://localhost:8000/v1 \
FINWORKER_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct \
finworker

# A hosted provider — the key is read from its conventional env var
DEEPSEEK_API_KEY=sk-… FINWORKER_PROVIDER=deepseek finworker
```

| Variable | Purpose |
|---|---|
| `FINWORKER_PROVIDER` | Provider id. Unset means Anthropic. |
| `FINWORKER_BASE_URL` | Overrides the provider's default endpoint. Required for `openai-compatible`. |
| `FINWORKER_API_KEY` | Overrides the provider's conventional key env var. |
| `FINWORKER_MODEL` | Model id to run. Takes precedence over `ANTHROPIC_MODEL`. |
| `FINWORKER_SMALL_MODEL` | Cheaper model for side-queries (titles, summaries). Defaults to the main model. |

Built-in provider ids: `openai-compatible`, `ollama`, `openrouter`, `deepseek`, `moonshot`,
`together`, `groq`, `fireworks`, `dashscope`, `zhipu`.

Misconfiguration fails at startup with an actionable message rather than as an opaque
error on the first request.

## How it works

finWorker's internal data model is the Anthropic wire format — an assistant turn is a
`BetaMessage`, and roughly 120 files read that shape directly. Rather than replace it, a
provider is an **adapter**: it accepts an Anthropic request, speaks the provider's format
on the wire, and returns Anthropic-shaped events. Nothing downstream of the API client
knows which provider served the turn.

The adapter is installed as the Anthropic SDK's `fetch`
(`src/services/api/providers/openaiFetch.ts`), so the SDK still supplies request promises,
stream decoding, retries, timeouts, abort handling and the `APIError` hierarchy.

```
claude.ts ──> getAnthropicClient()          src/services/api/client.ts
                └─ custom provider? ──> new Anthropic({ fetch: createProviderFetch(…) })
                                              │
                     Anthropic request ───────┤
                                              ├─> toOpenAIRequest()      openaiRequest.ts
                                              │     tool_use  → tool_calls
                                              │     tool_result → role:'tool'
                                              │     schema projection    toolSchema.ts
                                              │
                     Anthropic SSE  <─────────┴─  AnthropicEventBuilder  openaiStream.ts
                                                    OpenAI chunks → content blocks
```

### What is dropped, and why

Anthropic-only request features have no equivalent and are omitted rather than
approximated: `thinking` budgets, `output_config` (effort, structured output),
`speed`, `context_management`, beta headers, `metadata`, and `cache_control`
breakpoints. Anthropic-executed server tools (advisor, web search) are removed from the
tool list so the model is not told about tools that cannot run.

Assistant `thinking` blocks from earlier turns are dropped when replaying history: they
carry an Anthropic-issued signature that another provider cannot verify, and replaying
them as ordinary assistant text would misrepresent what the model had committed to.

Reasoning models that expose `reasoning_content` (DeepSeek-R1, Qwen QwQ) are surfaced as
Anthropic `thinking` blocks with an empty signature.

### The small/fast model

finWorker uses a cheaper model for side-queries such as conversation titles. That default
is Haiku, which no open provider serves, so on a custom provider it falls back to the main
model. Set `FINWORKER_SMALL_MODEL` to point it at something genuinely smaller.

### Token accounting

OpenAI reports `prompt_tokens` inclusive of cache hits; Anthropic reports a
non-overlapping breakdown. The adapter subtracts so the two never double-count.

OpenAI-compatible endpoints expose no token-counting endpoint, so `count_tokens` is served
by a local estimate. Exact accounting still comes from `usage` on each response.

## Adding a provider

A provider that already speaks OpenAI chat completions is one entry in
`src/services/api/providers/profiles.ts` — id, display name, base URL, and the env var its
key conventionally lives in. Only a genuinely new wire format needs code.
