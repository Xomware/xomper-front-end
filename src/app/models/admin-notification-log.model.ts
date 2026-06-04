/**
 * TS port of iOS AdminNotificationLogEntry.
 * Mirrors the xomper-notification-log DynamoDB schema.
 * All fields except id/day/epochMs/kind/status are optional (channel-specific).
 */
export interface AdminNotificationLogEntry {
  id: string
  day: string
  epochMs: number
  kind: string
  status: string
  userId?: string | null
  title?: string | null
  body?: string | null
  category?: string | null
  recipient?: string | null
  subject?: string | null
  bodySnippet?: string | null
  handler?: string | null
  error?: string | null
}

/** Wire shape (snake_case) from GET /admin/notifications. */
export interface AdminNotificationLogEntryRaw {
  id?: string
  day?: string
  epoch_ms?: number
  kind?: string
  status?: string
  user_id?: string | null
  title?: string | null
  body?: string | null
  category?: string | null
  recipient?: string | null
  subject?: string | null
  body_snippet?: string | null
  handler?: string | null
  error?: string | null
}

export interface AdminNotificationsResponse {
  rows: AdminNotificationLogEntryRaw[]
  count: number
}

export function mapNotificationEntry(raw: AdminNotificationLogEntryRaw): AdminNotificationLogEntry {
  return {
    id: raw.id ?? crypto.randomUUID(),
    day: raw.day ?? '',
    epochMs: raw.epoch_ms ?? 0,
    kind: raw.kind ?? '',
    status: raw.status ?? '',
    userId: raw.user_id ?? null,
    title: raw.title ?? null,
    body: raw.body ?? null,
    category: raw.category ?? null,
    recipient: raw.recipient ?? null,
    subject: raw.subject ?? null,
    bodySnippet: raw.body_snippet ?? null,
    handler: raw.handler ?? null,
    error: raw.error ?? null,
  }
}

export interface AdminNotificationListOpts {
  sleeperUserId: string
  daysBack?: number
  kind?: 'push' | 'email'
  status?: 'success' | 'failure'
  limit?: number
}
