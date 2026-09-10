# FinWorker

FinWorker is a CLI tool and AI agent platform for software engineering and financial analysis, forked from Claude Code and rebranded.

## Build & Run

- Runtime: Bun >= 1.1.0
- Install deps: `bun install`
- Build CLI bundle: `bun run build`
- Build production: `bun run build:prod`
- Build web interface: `bun run build:web`
- Typecheck: `bun run typecheck` (runs `tsc --noEmit`)
- Lint: `bun run lint` (Biome)
- Lint + fix: `bun run lint:fix`
- Format: `bun run format`
- Full check: `bun run check` (Biome + tsc)

## Project Structure

- `src/` — CLI source (TypeScript, React/Ink for terminal UI)
  - `src/entrypoints/cli.tsx` — main CLI entrypoint
  - `src/main.tsx` — app bootstrap
  - `src/tools/` — tool implementations (Bash, Read, Edit, Write, Glob, Grep, Agent, etc.)
  - `src/constants/prompts.ts` — system prompt construction
  - `src/constants/system.ts` — system constants (prefix, attribution)
  - `src/services/api/` — API client for Claude
  - `src/memdir/` — memory system
  - `src/skills/` — skill definitions
  - `src/utils/` — shared utilities
- `web/` — Next.js web interface
- `mcp-server/` — MCP server for IDE integrations
- `scripts/` — build scripts (`build-bundle.ts`, `build.sh`)
- `prompts/` — onboarding and setup prompts

## Git Conventions

- Main branch: `dev` (not `main`)
- Clone with: `git clone -b dev`

## Code Style

- Formatter: Biome (tabs, 2-width indent, 100 line width)
- Linter: Biome with recommended rules
- Language: TypeScript with strict mode
- UI: React 19 + Ink (terminal), Next.js (web)
- Module system: ESM (`"type": "module"`)
- Import paths use `.js` extensions for ESM compatibility

## Key Branding

- Product name: **FinWorker** (not Claude Code)
- CLI command: `finworker`
- Package name: `finworker`
- Issues: https://github.com/yushilinGithub/finWorker/issues
