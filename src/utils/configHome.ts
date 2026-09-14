import { cpSync, existsSync, renameSync, rmSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
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
  // Follows CLAUDE_CONFIG_DIR the same way Claude Code's own resolution does — with it
  // set, the file lives beside that directory, not in the home directory.
  return join(process.env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json')
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

    // Said before the copy, not after: this is synchronous and a long-lived Claude Code
    // install can be several GB, so the CLI would otherwise sit silent with no explanation.
    // biome-ignore lint/suspicious/noConsole: runs before the UI exists
    console.error(`finWorker: first run — copying ${source} to ${target}…`)

    // Copied to a sibling and renamed into place. cpSync is not atomic, and a throw
    // partway (unreadable file, dangling symlink, ENOSPC) would otherwise leave a
    // half-populated ~/.finworker that the existsSync guard treats as finished — a
    // silently truncated config that can never re-seed.
    const staging = `${target}.seeding.${process.pid}`
    rmSync(staging, { recursive: true, force: true })
    try {
      // cpSync copies file modes, so .credentials.json keeps its 0600.
      cpSync(source, staging, {
        recursive: true,
        preserveTimestamps: true,
        // Top level only. Matching on basename at any depth would also drop an unrelated
        // nested directory that happens to be called `ide` or `daemon` — a plugin's, say.
        filter: src =>
          dirname(src) !== source || !EXCLUDED_FROM_SEED.has(src.slice(source.length + 1)),
      })
      renameSync(staging, target)
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      throw error
    }
    seedGlobalConfigFile()

    // biome-ignore lint/suspicious/noConsole: runs before the UI exists
    console.error(
      `finWorker: done. The two are independent from now on; ${source} is no longer read.`,
    )
  } catch (error) {
    // A failed seed means finWorker starts with default settings — worse than inheriting
    // them, but not a reason to refuse to launch. Said out loud so it is not a silent
    // downgrade, and the staging dir is gone so the next launch retries.
    // biome-ignore lint/suspicious/noConsole: runs before the UI exists
    console.error(`finWorker: could not seed config directory (${(error as Error).message}). Starting with defaults.`)
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
