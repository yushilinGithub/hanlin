/**
 * Streaming "connector text" content blocks.
 *
 * The API emits these alongside regular text when a connector is producing
 * intermediate output. They stream like text blocks: a `connector_text`
 * content block opens, then `connector_text_delta` deltas append to it.
 *
 * Gated behind the CONNECTOR_TEXT feature flag at every call site.
 */

export type ConnectorTextBlock = {
  type: 'connector_text'
  connector_text: string
}

export type ConnectorTextDelta = {
  type: 'connector_text_delta'
  connector_text: string
}

export function isConnectorTextBlock(
  block: unknown,
): block is ConnectorTextBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: unknown }).type === 'connector_text'
  )
}

export function isConnectorTextDelta(
  delta: unknown,
): delta is ConnectorTextDelta {
  return (
    typeof delta === 'object' &&
    delta !== null &&
    (delta as { type?: unknown }).type === 'connector_text_delta'
  )
}
