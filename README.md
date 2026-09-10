<div align="center">

# finWorker CLI

**AI Coding Assistant & Financial Engineering Agent CLI for Development and Automation**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![Runtime](https://img.shields.io/badge/Runtime-Bun%20%3E%3D%201.1.0-f472b6?logo=bun&logoColor=white)](#tech-stack)
[![UI](https://img.shields.io/badge/UI-React%2019%20%2B%20Ink-61DAFB?logo=react&logoColor=black)](#tech-stack)
[![MCP Server](https://img.shields.io/badge/MCP-Explorer%20Server-blueviolet)](#-mcp-server-integration)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 📖 Overview

**finWorker** is an advanced CLI tool and autonomous AI agent platform designed for software engineering, financial modeling, workflow automation, and terminal interaction. Operating directly in your workspace, finWorker executes complex multi-step coding, code analysis, git workflows, financial data processing, and multi-agent task execution.

### Key Highlights

- **⚡ Modern Tech Stack**: Powered by [Bun](https://bun.sh) and TypeScript for instant startup and execution speed.
- **💻 Rich Terminal UI**: Built with React 19 and Ink for intuitive, responsive interactive REPL experiences.
- **🔌 MCP Protocol Native**: Features a built-in Model Context Protocol (MCP) server for integration with Claude Desktop, VS Code Copilot, and Cursor.
- **🤖 Multi-Agent Orchestration**: Autonomous sub-agents, task management, inter-agent messaging, and background execution.
- **📊 Financial Engineering Integration**: Optimized for quant workflow automation, data processing, and financial API orchestration.
- **🛡️ Granular Permissions**: Comprehensive safety controls and approval flows for file modifications and terminal command executions.

---

## 🚀 Quick Start

### Prerequisites

- **Bun**: `>= 1.1.0` (Install via `curl -fsSL https://bun.sh/install | bash`)
- **Node.js**: `>= 20` (Optional, for MCP server building)

### Installation

```bash
# 1. Clone the repository
git clone -b dev https://github.com/yushilinGithub/finWorker.git
cd finWorker

# 2. Install dependencies
bun install

# 3. Build the CLI bundle
bun run build
```

### Usage

Run finWorker CLI directly with Bun:

```bash
# Run CLI REPL
bun run src/entrypoints/cli.tsx

# Or execute built bundle
node dist/cli.js
```

---

## 🔍 MCP Server Integration

finWorker ships with an embedded [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server (`mcp-server/`), allowing external AI tools (Claude Desktop, VS Code, Cursor) to interact with and explore the finWorker repository structure.

### Setting Up MCP Server

```bash
# Build the MCP server
cd mcp-server
npm install
npm run build

# Add to finWorker MCP registry
bun run src/entrypoints/cli.tsx mcp add finWorker-explorer -- node ./mcp-server/dist/index.js
```

### Claude Desktop / VS Code Configuration

Add the server to your `mcp.json` configuration:

```json
{
  "mcpServers": {
    "finWorker-explorer": {
      "command": "node",
      "args": ["/path/to/finWorker/mcp-server/dist/index.js"],
      "env": {
        "FINCLAW_SRC_ROOT": "/path/to/finWorker/src"
      }
    }
  }
}
```

---

## 🏗 Architecture & Core Modules

```
finWorker/
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

finWorker provides a rich set of built-in tools for agent execution:

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
- [Tools Catalog](docs/tools.md) — Detailed specifications for all agent tools.
- [Commands Reference](docs/commands.md) — Documentation for slash commands.
- [Subsystems Overview](docs/subsystems.md) — In-depth breakdown of Bridge, MCP, and Permissions.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
