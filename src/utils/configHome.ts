import { cpSync, existsSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import { getGlobalClaudeFile } from './env.js'
import { getClaudeConfigHomeDir } from './envUtils.js'

/**
 * Live state belonging to a *running* Claude Code process.
 *
 * Seeding these would hand finWorker a lock file pointing at someone else's daemon and an
 * IDE socket it does not own, so it would believe services are running that are not its
 * own.
 */
const EXCLUDED_FROM_SEED = new Set([
  'daemon',
  'daemon.lock',
  'daemon.log',
  'daemon.status.json',
  'ide',
])

function legacyConfigHome(): string {
  return join(homedir(), '.claude')
}

function legacyGlobalConfigFile(): string {
  return join(homedir(), '.claude.json')
}

/**
 * Seed finWorker's config directory from Claude Code's, once.
 *
 * finWorker forked from Claude Code and used to share `~/.claude`, which meant a
 * finWorker-only setting — a `provider/model` string, say — would break Claude Code, which
 * has no provider layer to resolve it. The directories are now separate; this copies an
 * existing setup across on first run so nobody has to reconfigure by hand.
 *
 * Runs only when the destination is absent, so it happens at most once and the two
 * directories diverge permanently afterwards. `~/.claude` is never written to.
 *
 * Must be called before anything reads settings — see the call site in
 * `src/entrypoints/cli.tsx`.
 */
export function ensureConfigHomeSeeded(): void {
  try {
    const target = getClaudeConfigHomeDir()
    const source = legacyConfigHome()

    // Nothing to do if finWorker already has a home, or if this *is* the legacy path
    // because the user pointed CLAUDE_CONFIG_DIR at it.
    if (existsSync(target) || target === source || !existsSync(source)) {
      seedGlobalConfigFile()
      return
    }

    // cpSync copies file modes, so .credentials.json keeps its 0600.
    cpSync(source, target, {
      recursive: true,
      preserveTimestamps: true,
      filter: src => !EXCLUDED_FROM_SEED.has(basename(src)),
    })
    seedGlobalConfigFile()

    // biome-ignore lint/suspicious/noConsole: runs before the UI exists
    console.error(
      `finWorker: created ${target} from ${source}. The two are independent from now on; ` +
        `${source} is no longer read.`,
    )
  } catch {
    // A failed seed means finWorker starts with default settings — worse than inheriting
    // them, but not a reason to refuse to launch.
  }
}

/**
 * `~/.claude.json` sits beside the config directory rather than inside it, so it needs
 * copying separately or global state stays shared.
 */
function seedGlobalConfigFile(): void {
  try {
    const source = legacyGlobalConfigFile()
    // Resolved rather than hardcoded: the file follows FINWORKER_CONFIG_DIR /
    // CLAUDE_CONFIG_DIR when either is set.
    const target = getGlobalClaudeFile()
    if (existsSync(target) || target === source || !existsSync(source)) return
    cpSync(source, target, { preserveTimestamps: true })
  } catch {
    // Same rationale as above.
  }
}
