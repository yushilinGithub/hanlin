// src/shims/macro.ts

// Read version from package.json at startup
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const pkgPath = resolve(dirname(__filename), '..', '..', 'package.json')
let version = '0.0.0-dev'
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  version = pkg.version || version
} catch {}

const ISSUES_URL = 'https://github.com/yushilinGithub/finWorker/issues'

const MACRO_OBJ = {
  VERSION: version,
  PACKAGE_URL: 'finworker',
  NATIVE_PACKAGE_URL: undefined as string | undefined,
  ISSUES_EXPLAINER: `report issues at ${ISSUES_URL}`,
  FEEDBACK_CHANNEL: ISSUES_URL,
  BUILD_TIME: new Date().toISOString(),
  VERSION_CHANGELOG: '',
}

// Install as global
;(globalThis as any).MACRO = MACRO_OBJ

export default MACRO_OBJ
