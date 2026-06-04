/**
 * One row from the Supabase admin_audit table.
 * Mirrors iOS AuditEntry from AuditEntry.swift.
 *
 * before / after / metadata are stored as JSONB blobs — arbitrary JSON.
 * The detail view pretty-prints them via JSON.stringify(value, null, 2).
 */
export interface AuditEntry {
  id: string
  createdAt: string          // ISO-8601
  actorUserId: string
  action: string
  targetTable: string | null
  targetId: string | null
  before: unknown | null
  after: unknown | null
  metadata: unknown | null
}

export interface AuditEntryRaw {
  id: string
  created_at: string
  actor_user_id: string
  action: string
  target_table?: string | null
  target_id?: string | null
  before?: unknown | null
  after?: unknown | null
  metadata?: unknown | null
}

export interface AuditListResponse {
  Success?: boolean
  count?: number
  rows: AuditEntryRaw[]
  next_cursor?: string | null
  table_missing?: boolean
}

export function mapAuditEntry(raw: AuditEntryRaw): AuditEntry {
  return {
    id: raw.id,
    createdAt: raw.created_at,
    actorUserId: raw.actor_user_id,
    action: raw.action,
    targetTable: raw.target_table ?? null,
    targetId: raw.target_id ?? null,
    before: raw.before ?? null,
    after: raw.after ?? null,
    metadata: raw.metadata ?? null,
  }
}

/** Human-friendly verb. Mirrors iOS AuditEntry.actionDisplay. */
export function auditActionDisplay(action: string): string {
  const map: Record<string, string> = {
    'users.update':   'Updated user',
    'leagues.update': 'Updated league',
    'reports.flag':   'Flagged report',
    'email.test':     'Sent test email',
  }
  return map[action] ?? action
}

/** Lucide / material icon name suitable for the action. Web equivalent of iOS SF Symbols. */
export function auditActionIcon(action: string): string {
  const map: Record<string, string> = {
    'users.update':   'user',
    'leagues.update': 'building-2',
    'reports.flag':   'flag',
    'email.test':     'send',
  }
  return map[action] ?? 'circle-dashed'
}
