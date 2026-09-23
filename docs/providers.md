# Model providers

Hanlin runs on Anthropic's Claude models by default, and can be pointed at any
OpenAI-compatible endpoint instead — self-hosted (vLLM, SGLang, LM Studio, Ollama) or
hosted (DeepSeek, OpenRouter, Together, Groq, Fireworks, DashScope, Zhipu, Moonshot).

## Configuring a provider

Set `HANLIN_PROVIDER` to select one. Anthropic remains the default when it is unset.

```bash
# Local Ollama — no API key needed
HANLIN_PROVIDER=ollama hanlin -p "explain this repo"

# Any OpenAI-compatible server (vLLM, SGLang, LM Studio, …)
HANLIN_PROVIDER=openai-compatible \
HANLIN_BASE_URL=http://localhost:8000/v1 \
HANLIN_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct \
hanlin

# A hosted provider — the key is read from its conventional env var
DEEPSEEK_API_KEY=sk-… HANLIN_PROVIDER=deepseek hanlin
```

### DeepSeek V4 Pro

`deepseek-v4-pro` is served by Alibaba's DashScope compatible-mode endpoint, not by
DeepSeek's own API:

```bash
DASHSCOPE_API_KEY=sk-… HANLIN_PROVIDER=dashscope HANLIN_MODEL=deepseek-v4-pro hanlin
```

| Variable | Purpose |
|---|---|
| `HANLIN_PROVIDER` | Provider id. Unset means Anthropic. |
| `HANLIN_BASE_URL` | Overrides the provider's default endpoint. Required for `openai-compatible`. |
| `HANLIN_API_KEY` | Overrides the provider's conventional key env var. |
| `HANLIN_MODEL` | Model id to run. Takes precedence over `ANTHROPIC_MODEL`. Accepts `provider/model`. |
| `HANLIN_SMALL_MODEL` | Cheaper model for side-queries (titles, summaries). Defaults to the main model. |

Built-in provider ids: `openai-compatible`, `ollama`, `openrouter`, `deepseek`, `moonshot`,
`together`, `groq`, `fireworks`, `dashscope`, `zhipu`.

Misconfiguration fails at startup with an actionable message rather than as an opaque
error on the first request.

## Choosing a model with `/model`

`/model` lists Claude's models, then a section per provider you can already reach — one
configured in `settings.json`, or one whose API key is in the environment. Each row shows
what the catalog knows:

```
  ── Alibaba DashScope (Qwen) ──
  DeepSeek V4 Pro       1M ctx · $0.44/$0.87 per Mtok · reasoning
  Qwen3.8 Max           1M ctx · $1.78/$5.33 per Mtok · reasoning

  Browse all providers…
```

`Browse all providers…` opens the full catalog: every provider, then its models. Providers
you cannot reach yet are still listed and marked with the env var they need, so you can see
what exists before setting one up. Selecting such a model still applies it — the
confirmation names the variable to set rather than failing later.

Models without tool calling are omitted throughout: Hanlin is an agent, and a model that
cannot call a tool cannot run the loop.

## The model catalog

Provider endpoints, model limits and pricing come from [models.dev](https://models.dev) —
the same catalog opencode uses. It is fetched in the background, cached at
`~/.hanlin/cache/models-dev.json`, and refreshed once a day. Hanlin never blocks on it:
with no cache and no network, `/model` still lists Claude's models and anything you
configured explicitly.

| Variable | Purpose |
|---|---|
| `HANLIN_MODELS_URL` | Alternate catalog URL |
| `HANLIN_DISABLE_MODELS_FETCH` | Never fetch; use the cache if present |

This is what makes `alibaba-cn/deepseek-v4-pro` work without Hanlin hardcoding Alibaba:
the catalog already records the endpoint, the key's env var and the model's 1M context.

Built-in short ids are aliases for catalog ids where they differ — `dashscope` is
`alibaba-cn`, `moonshot` is `moonshotai-cn`, `fireworks` is `fireworks-ai`, `zhipu` is
`zhipuai`, `together` is `togetherai`. Either form works.

## Where configuration lives

Hanlin keeps its own configuration, separate from Claude Code's:

| Scope | Path |
|---|---|
| User | `~/.hanlin/settings.json` |
| Global state | `~/.hanlin.json` |
| Project | `<repo>/.claude/settings.json` |
| Local | `<repo>/.claude/settings.local.json` |

`HANLIN_CONFIG_DIR` (or `CLAUDE_CONFIG_DIR`) moves the user directory. On first run,
`~/.hanlin` is seeded from `~/.claude` if that exists, minus the daemon and IDE state of
any running Claude Code; the two then diverge and `~/.claude` is never read again.

Project-level paths deliberately stay `.claude/` — that directory is a per-repo convention
and is often committed, so renaming it would orphan configs that already exist.

**The macOS keychain entry is still shared** with Claude Code. Logging out of one signs out
the other, and a token refresh in either can invalidate the other's session. The copied
`~/.hanlin/.credentials.json` is only consulted when the keychain has no entry.

## Configuring in settings.json

Environment variables suit one-off runs; `settings.json` is the durable form. A
`provider/model` value in `model` selects both at once.

```jsonc
{
  "model": "dashscope/deepseek-v4-pro",
  "providers": {
    "dashscope": {
      "models": {
        // Without these, a 1M model is metered against Claude's 200k default and
        // autocompacts at a fifth of its real capacity.
        "deepseek-v4-pro": { "contextWindow": 1000000, "maxOutputTokens": 384000 }
      }
    }
  }
}
```

An entry under `providers` overrides the built-in profile field by field, so pointing a
known provider at a mirror does not mean restating the rest of it:

```jsonc
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "providers": {
    "deepseek": { "baseURL": "https://my-gateway.internal/v1", "apiKeyEnv": "GATEWAY_KEY" }
  }
}
```

A provider that is not built in is defined the same way — give it a `baseURL` and it
works:

```jsonc
{
  "model": "local-vllm/Qwen3-Coder-30B",
  "providers": {
    "local-vllm": { "baseURL": "http://localhost:8000/v1", "name": "Local vLLM" }
  }
}
```

Prefer `apiKeyEnv` over `apiKey`: settings.json is plaintext and often checked in.

### Precedence

Provider: `HANLIN_PROVIDER` → `provider/` prefix on the model → `provider` in settings.
Model: `/model` → `--model` → `HANLIN_MODEL` → `ANTHROPIC_MODEL` → `model` in settings.
Key: `HANLIN_API_KEY` → `providers.<id>.apiKeyEnv` → `providers.<id>.apiKey` → the
provider's conventional env var.

## How it works

Hanlin's internal data model is the Anthropic wire format — an assistant turn is a
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

Hanlin uses a cheaper model for side-queries such as conversation titles. That default
is Haiku, which no open provider serves, so on a custom provider it falls back to the main
model. Set `HANLIN_SMALL_MODEL` to point it at something genuinely smaller.

### Token accounting

OpenAI reports `prompt_tokens` inclusive of cache hits; Anthropic reports a
non-overlapping breakdown. The adapter subtracts so the two never double-count.

OpenAI-compatible endpoints expose no token-counting endpoint, so `count_tokens` is served
by a local estimate. Exact accounting still comes from `usage` on each response.

## Adding a provider

A provider that already speaks OpenAI chat completions is one entry in
`src/services/api/providers/profiles.ts` — id, display name, base URL, and the env var its
key conventionally lives in. Only a genuinely new wire format needs code.
