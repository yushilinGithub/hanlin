// src/shims/preload.ts
// Must be loaded before any application code.
// Provides runtime equivalents of Bun bundler build-time features.

import './macro.js'
// bun:bundle is resolved via the build alias, not imported here

// Node emits DEP0040 because a transitive dependency still requires the
// deprecated `punycode` builtin: @anthropic-ai/sdk -> node-fetch@2 ->
// whatwg-url@5 -> tr46. Nothing in this repo can act on it, so drop just that
// one code and let every other warning through. The bundled build does the
// same from its banner (see scripts/build-bundle.ts).
const emitWarning = process.emitWarning.bind(process)
process.emitWarning = ((warning: unknown, ...rest: unknown[]) => {
  const opts = rest[0]
  const code =
    opts && typeof opts === 'object'
      ? (opts as { code?: string }).code
      : (rest[1] as string | undefined)
  if (code === 'DEP0040') return
  if (typeof warning === 'string' && warning.includes('punycode')) return
  return (emitWarning as (...a: unknown[]) => void)(warning, ...rest)
}) as typeof process.emitWarning
