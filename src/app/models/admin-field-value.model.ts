/**
 * Discriminated union for admin update payloads.
 * Mirrors iOS AdminFieldValue enum — keeps the API surface type-safe
 * up to the JSON serialization hop.
 *
 * Usage: { "fields": { "is_admin": { kind: 'bool', value: true } } }
 * The service layer converts to raw JSON scalars before sending.
 */
export type AdminFieldValue =
  | { kind: 'string'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'int'; value: number }
  | { kind: 'null' }

/** Render an AdminFieldValue as a JSON-serializable scalar. */
export function adminFieldValueToJson(v: AdminFieldValue): unknown {
  switch (v.kind) {
    case 'string': return v.value
    case 'bool':   return v.value
    case 'int':    return v.value
    case 'null':   return null
  }
}
