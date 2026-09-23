<div align="center">

# 翰林 Hanlin

**AI coding assistant and financial research agent for the terminal**

*翰林 (Hànlín) — the imperial academy of scholar-advisors*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![Runtime](https://img.shields.io/badge/Runtime-Bun%20%3E%3D%201.1.0-f472b6?logo=bun&logoColor=white)](#tech-stack)
[![UI](https://img.shields.io/badge/UI-React%2019%20%2B%20Ink-61DAFB?logo=react&logoColor=black)](#tech-stack)
[![MCP Server](https://img.shields.io/badge/MCP-Explorer%20Server-blueviolet)](#-mcp-server-integration)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 📖 Overview

**Hanlin** (翰林) is a CLI tool and autonomous AI agent platform for software engineering, financial research, workflow automation, and terminal interaction. Operating directly in your workspace, Hanlin executes multi-step coding, code analysis, git workflows, financial research and multi-agent task execution.

It runs on Anthropic's Claude models, and equally on any OpenAI-compatible provider — self-hosted (vLLM, SGLang, Ollama) or hosted (DeepSeek, Qwen/DashScope, Moonshot, Zhipu, OpenRouter, …). Features that Anthropic implements server-side, such as web search, have their own implementation for those providers, so the agent behaves the same whichever model serves it.

### Key Highlights

- **⚡ Modern Tech Stack**: Powered by [Bun](https://bun.sh) and TypeScript for instant startup and execution speed.
- **💻 Rich Terminal UI**: Built with React 19 and Ink for intuitive, responsive interactive REPL experiences.
- **🔌 MCP Protocol Native**: Features a built-in Model Context Protocol (MCP) server for integration with Claude Desktop, VS Code Copilot, and Cursor.
- **🤖 Multi-Agent Orchestration**: Autonomous sub-agents, task management, inter-agent messaging, and background execution.
- **📊 Financial Engineering Integration**: Optimized for quant workflow automation, data processing, and financial API orchestration.
- **🔎 Research-Grade Search**: One `WebSearch` tool routed to specialist sources — market news, A-share disclosures, research papers and general web search — every result dated and cited.
- **🌏 Any Model, Any Language**: Claude or any OpenAI-compatible provider; queries and answers in Chinese or English.
- **🛡️ Granular Permissions**: Comprehensive safety controls and approval flows for file modifications and terminal command executions.

---

## 🚀 Quick Start

### Prerequisites

- **Bun**: `>= 1.1.0` (Install via `curl -fsSL https://bun.sh/install | bash`)
- **Node.js**: `>= 20` (Optional, for MCP server building)

### Installation

```bash
# 1. Clone the repository
git clone -b dev https://github.com/yushilinGithub/hanlin.git
cd hanlin

# 2. Install dependencies
bun install

# 3. Build the CLI bundle
bun run build
```

### Usage

Run Hanlin CLI directly with Bun:

```bash
# Run CLI REPL
bun run src/entrypoints/cli.tsx

# Or execute built bundle
node dist/cli.mjs

# Ask a single question without entering the REPL
node dist/cli.mjs -p "半导体设备最新新闻"
```

Configuration lives in `~/.hanlin/settings.json` (user scope) and `<repo>/.claude/settings.json` (project scope).

---

## 🧠 Models & Providers

Anthropic is the default. Any other provider is selected with `HANLIN_PROVIDER`, or by setting `model` in `~/.hanlin/settings.json` to a `provider/model` pair:

```bash
# A hosted provider — the key is read from its conventional env var
DEEPSEEK_API_KEY=sk-… HANLIN_PROVIDER=deepseek hanlin

# Any OpenAI-compatible server (vLLM, SGLang, LM Studio, …)
HANLIN_PROVIDER=openai-compatible HANLIN_BASE_URL=http://localhost:8000/v1 \
  HANLIN_MODEL=Qwen/Qwen2.5-Coder-32B-Instruct hanlin
```

| Variable | Purpose |
|---|---|
| `HANLIN_PROVIDER` | Provider id. Unset means Anthropic. |
| `HANLIN_BASE_URL` | Overrides the provider's endpoint. |
| `HANLIN_API_KEY` | Overrides the provider's conventional key variable. |
| `HANLIN_MODEL` | Model to run; accepts `provider/model`. |
| `HANLIN_SMALL_MODEL` | Cheaper model for side queries (titles, search routing). |

See [docs/providers.md](docs/providers.md) for the full catalog, `/model` behavior and `settings.json` examples.

---

## 🔎 Search

`WebSearch` takes a plain query and routes it to the sources that fit, in Chinese or English. On Anthropic models it uses Anthropic's server-side web search; on every other provider a small model picks among specialist sources and Hanlin queries them directly:

| Source | Covers |
|---|---|
| Yahoo Finance | Company and market news by ticker, including `.SZ` / `.SS` / `.HK` listings |
| 东方财富 Eastmoney (falling back to 新浪财经 Sina) | Chinese financial news |
| 巨潮资讯 cninfo | A-share announcements: annual, semi-annual and quarterly reports, earnings forecasts, dividends |
| arXiv · PubMed · OpenAlex | Preprints, biomedical literature, and published papers incl. IEEE |
| Hugging Face · Hacker News | AI models and papers; product launches and developer discussion |
| Tavily (optional, `TAVILY_API_KEY`) | General web and news search; also the automatic backup when the sources above return nothing |

Every result carries a publish date and a link, and answers cite their sources.

---

## 🔍 MCP Server Integration

Hanlin ships with an embedded [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server (`mcp-server/`), allowing external AI tools (Claude Desktop, VS Code, Cursor) to interact with and explore the Hanlin repository structure.

### Setting Up MCP Server

```bash
# Build the MCP server
cd mcp-server
npm install
npm run build

# Add to Hanlin MCP registry
bun run src/entrypoints/cli.tsx mcp add hanlin-explorer -- node ./mcp-server/dist/index.js
```

### Claude Desktop / VS Code Configuration

Add the server to your `mcp.json` configuration:

```json
{
  "mcpServers": {
    "hanlin-explorer": {
      "command": "node",
      "args": ["/path/to/hanlin/mcp-server/dist/index.js"],
      "env": {
        "HANLIN_SRC_ROOT": "/path/to/hanlin/src"
      }
    }
  }
}
```

---

## 🏗 Architecture & Core Modules

```
hanlin/
├── src/
│   ├── main.tsx                 # CLI entrypoint & Commander.js parser
│   ├── QueryEngine.ts           # Core LLM streaming API caller
│   ├── Tool.ts                  # Base Tool interfaces & type definitions
│   ├── commands.ts              # Slash command registry
│   ├── tools/                   # Agent Tool implementations (~40+ tools)
│   ├── commands/                # Interactive Slash Commands (~50+ commands)
│   ├── coordinator/             # Multi-agent worker orchestration
│   ├── bridge/                  # IDE extension bidirectional communication
│   ├── services/                # API clients, MCP, OAuth, LSP, & Telemetry
│   ├── hooks/                   # Permission checks & state management
│   ├── components/              # Terminal React/Ink UI components
│   └── screens/                 # Full-screen terminal views (REPL, Doctor, Resume)
├── mcp-server/                  # Model Context Protocol explorer server
├── web/                         # Web Interface (Next.js)
├── docs/                        # Comprehensive documentation
└── scripts/                     # Build and bundling scripts
```

### 1. Agent Tool System (`src/tools/`)

Hanlin provides a rich set of built-in tools for agent execution:

| Category | Tools | Description |
|---|---|---|
| **File Systems** | `FileReadTool`, `FileWriteTool`, `FileEditTool`, `NotebookEditTool` | Workspace file creation, string modification, and Jupyter notebook support |
| **Search & Navigation** | `GrepTool`, `GlobTool`, `WebSearchTool`, `WebFetchTool` | Fast codebase search (ripgrep), glob pattern matching, and web page fetching |
| **Execution** | `BashTool`, `SkillTool`, `MCPTool`, `LSPTool` | Shell execution, custom skills, MCP tools, and Language Server Protocol |
| **Agent Orchestration** | `AgentTool`, `SendMessageTool`, `TaskCreateTool`, `TaskUpdateTool` | Sub-agent spawning, inter-agent messaging, and background task management |
| **Workflow Controls** | `EnterPlanModeTool`, `SleepTool`, `CronCreateTool`, `WorktreeTool` | Plan mode safety toggles, proactive delays, cron scheduling, and git worktrees |

### 2. Slash Commands (`src/commands/`)

Interactive terminal commands available inside the REPL (`/` prefix):

| Command | Purpose | Command | Purpose |
|---|---|---|---|
| `/commit` | Autonomous Git commits | `/review` | Automated code review |
| `/compact` | Context window compression | `/mcp` | MCP server management |
| `/doctor` | System & environment diagnostics | `/tasks` | Task execution view |
| `/skills` | Custom skill management | `/config` | User & system configuration |

---

## 🛠 Script Commands

| Script | Command | Purpose |
|---|---|---|
| **Build CLI** | `bun run build` | Bundles the CLI using `esbuild` |
| **Build Web** | `bun run build:web` | Compiles the Next.js web interface |
| **Typecheck** | `bun run typecheck` | Validates TypeScript types across `src/` |
| **Linting** | `bun run lint` | Runs Biome code checks |
| **Lint Fix** | `bun run lint:fix` | Automatically formats and fixes code style |

---

## 📚 Documentation

For in-depth guides, see the [`docs/`](docs/) directory:

- [Architecture Guide](docs/architecture.md) — Core pipeline, state management, and data flow.
- [Model Providers](docs/providers.md) — Running Hanlin on Claude or any OpenAI-compatible provider.
- [Tools Catalog](docs/tools.md) — Detailed specifications for all agent tools.
- [Commands Reference](docs/commands.md) — Documentation for slash commands.
- [Subsystems Overview](docs/subsystems.md) — In-depth breakdown of Bridge, MCP, and Permissions.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
