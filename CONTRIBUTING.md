# Contributing to Hanlin

Thanks for your interest in contributing to Hanlin!

## What This Is

Hanlin is an open-source AI coding assistant CLI and Financial Engineering Worker. Contributions to core functionality, documentation, tools, and testing infrastructure are welcome.

## What You Can Contribute

- **Core CLI Features & Tools** — Implement new tools, commands, or UI capabilities
- **Documentation** — Improve or expand the [docs/](docs/) directory
- **MCP Integration** — Enhance Model Context Protocol capabilities
- **Testing & Tooling** — Add unit tests, integration tests, or developer tooling
- **Bug Fixes** — Report and resolve issues

## Getting Started

### Prerequisites

- **Bun** (>= 1.1.0) or **Node.js** 20+
- **Git**

### Setup

```bash
git clone -b dev https://github.com/yushilinGithub/hanlin.git
cd Hanlin
bun install
```

### Development & Checks

```bash
bun run build       # Build bundle
bun run typecheck   # TypeScript type check
bun run lint        # Biome lint
```

## Code Style

- TypeScript with strict mode enabled
- ES modules (`type: "module"`)
- Follow existing formatting (Biome)

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and test thoroughly
4. Commit with a clear message
5. Push and open a Pull Request
