/**
 * TS port of iOS EmailArchiveEntry.
 * Used for both list rows (htmlBody/textBody null) and detail (populated).
 * All fields except id/sentAt/subject/recipientEmail are nullable —
 * matches the server's mostly-nullable email_archive table.
 */
export interface EmailArchiveEntry {
  id: string
  sentAt: string
  template: string | null
  subject: string
  recipientEmail: string
  messageId: string | null
  htmlBody: string | null
  textBody: string | null
}

/** Wire shape (snake_case) from GET /admin/emails-list. */
export interface EmailArchiveEntryRaw {
  id: string
  sent_at: string
  template?: string | null
  subject: string
  recipient_email: string
  message_id?: string | null
  html_body?: string | null
  text_body?: string | null
}

/** GET /admin/emails-list response. */
export interface EmailArchiveListResponse {
  rows: EmailArchiveEntryRaw[]
  next_cursor: string | null
}

/** GET /admin/emails-detail response envelope. */
export interface EmailArchiveDetailEnvelope {
  row: EmailArchiveEntryRaw
}

/** POST /admin/emails-resend response. */
export interface ResendEmailResponse {
  sourceId: string
  recipientEmail: string
  subject: string
  template: string | null
  messageId: string | null
  sentAt: string
}

export interface ResendEmailResponseRaw {
  source_id: string
  recipient_email: string
  subject: string
  template?: string | null
  message_id?: string | null
  sent_at: string
}

export function mapEmailArchiveEntry(raw: EmailArchiveEntryRaw): EmailArchiveEntry {
  return {
    id: raw.id,
    sentAt: raw.sent_at,
    template: raw.template ?? null,
    subject: raw.subject,
    recipientEmail: raw.recipient_email,
    messageId: raw.message_id ?? null,
    htmlBody: raw.html_body ?? null,
    textBody: raw.text_body ?? null,
  }
}

export function mapResendEmailResponse(raw: ResendEmailResponseRaw): ResendEmailResponse {
  return {
    sourceId: raw.source_id,
    recipientEmail: raw.recipient_email,
    subject: raw.subject,
    template: raw.template ?? null,
    messageId: raw.message_id ?? null,
    sentAt: raw.sent_at,
  }
}
