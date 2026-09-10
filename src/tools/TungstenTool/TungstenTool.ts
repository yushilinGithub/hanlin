import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

/**
 * Tungsten is an Anthropic-internal tool. It is only registered when
 * USER_TYPE === 'ant' (see tools.ts), so it is inert in external builds.
 */

const inputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('The Tungsten query to run'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() => z.string())
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

export const TUNGSTEN_TOOL_NAME = 'Tungsten'

export const TungstenTool = buildTool({
  isMcp: false,
  name: TUNGSTEN_TOOL_NAME,
  searchHint: 'query internal Anthropic Tungsten datasets',
  isEnabled() {
    return process.env.USER_TYPE === 'ant'
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  isOpenWorld() {
    return true
  },
  async description(): Promise<string> {
    return 'Query internal Anthropic data via Tungsten'
  },
  async prompt(): Promise<string> {
    return 'Run a Tungsten query against internal Anthropic datasets.'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async call() {
    throw new Error(
      'The Tungsten tool is not available in this build of the CLI.',
    )
  },
  renderResultForAssistant(output: Output): string {
    return output
  },
})
