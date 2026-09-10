// scripts/bun-plugin-shims.ts
// Bun preload plugin — resolves imports that have no on-disk package to
// local shims so the CLI can run:
//   - `bun:bundle`  → src/shims/bun-bundle.ts (no production bundler pass)
//   - `@ant/*`      → src/shims/ant/*        (unpublished internal packages)

import { plugin } from 'bun'
import { resolve } from 'path'

const shimDir = resolve(import.meta.dir, '../src/shims')

const ANT_SHIMS: Record<string, string> = {
  '@ant/claude-for-chrome-mcp': 'ant/claude-for-chrome-mcp.ts',
  '@ant/computer-use-mcp': 'ant/computer-use-mcp/index.ts',
  '@ant/computer-use-mcp/types': 'ant/computer-use-mcp/types.ts',
  '@ant/computer-use-input': 'ant/computer-use-input.ts',
  '@ant/computer-use-swift': 'ant/computer-use-swift.ts',
}

plugin({
  name: 'bun-bundle-shim',
  setup(build) {
    build.onResolve({ filter: /^bun:bundle$/ }, () => ({
      path: resolve(shimDir, 'bun-bundle.ts'),
    }))

    // The native addon is not published; src/native-ts/ holds a TS port.
    build.onResolve({ filter: /^color-diff-napi$/ }, () => ({
      path: resolve(import.meta.dir, '../src/native-ts/color-diff/index.ts'),
    }))

    build.onResolve({ filter: /^@ant\// }, args => {
      const rel = ANT_SHIMS[args.path]
      if (!rel) return
      return { path: resolve(shimDir, rel) }
    })
  },
})
