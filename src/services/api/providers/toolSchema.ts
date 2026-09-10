import type { ToolSchemaDialect } from './types.js'

type JsonSchema = Record<string, any>

const NESTED_SCHEMA_KEYS = ['items', 'additionalProperties', 'not', 'if', 'then', 'else']
const SCHEMA_MAP_KEYS = ['properties', 'patternProperties', '$defs', 'definitions']
const VARIANT_KEYS = ['anyOf', 'oneOf', 'allOf']

function isNullVariant(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    (schema as JsonSchema).type === 'null' &&
    Object.keys(schema as JsonSchema).length === 1
  )
}

/**
 * Project a JSON Schema into the dialect a provider actually accepts.
 *
 * Zod produces schemas Anthropic takes verbatim but other providers reject. Rather than
 * weakening the tool definitions themselves, we translate at the wire boundary — the same
 * tool object still goes to Anthropic unchanged.
 */
export function projectToolSchema(schema: JsonSchema, dialect: ToolSchemaDialect): JsonSchema {
  if (typeof schema !== 'object' || schema === null) return schema
  if (Array.isArray(schema)) {
    return (schema as unknown[]).map(s => projectToolSchema(s as JsonSchema, dialect)) as never
  }

  const out: JsonSchema = {}

  for (const [key, value] of Object.entries(schema)) {
    // `type: ['string', 'null']` — providers that model nullability via a bare type union
    // choke on the tuple form. Collapse to the non-null member.
    if (key === 'type' && Array.isArray(value)) {
      const nonNull = value.filter(t => t !== 'null')
      out.type = nonNull.length === 1 ? nonNull[0] : nonNull.length > 0 ? nonNull : value
      continue
    }

    if (VARIANT_KEYS.includes(key) && Array.isArray(value)) {
      const variants = value
        .filter(v => !isNullVariant(v))
        .map(v => projectToolSchema(v as JsonSchema, dialect))
      // A one-variant union carries no information; inline it so the provider sees a
      // plain schema rather than a wrapper it may not support.
      if (variants.length === 1 && typeof variants[0] === 'object') {
        Object.assign(out, variants[0])
      } else if (variants.length > 0) {
        out[key] = variants
      }
      continue
    }

    if (dialect === 'restricted') {
      // Moonshot/Kimi reject these outright.
      if (key === 'prefixItems' || key === 'unevaluatedItems') continue
      // Tuple-form `items` is not understood; degrade to the first element's schema.
      if (key === 'items' && Array.isArray(value)) {
        out.items = value.length > 0 ? projectToolSchema(value[0] as JsonSchema, dialect) : {}
        continue
      }
    }

    if (SCHEMA_MAP_KEYS.includes(key) && typeof value === 'object' && value !== null) {
      const mapped: JsonSchema = {}
      for (const [name, sub] of Object.entries(value as JsonSchema)) {
        mapped[name] = projectToolSchema(sub as JsonSchema, dialect)
      }
      out[key] = mapped
      continue
    }

    if (NESTED_SCHEMA_KEYS.includes(key) && typeof value === 'object' && value !== null) {
      out[key] = projectToolSchema(value as JsonSchema, dialect)
      continue
    }

    out[key] = value
  }

  return out
}
