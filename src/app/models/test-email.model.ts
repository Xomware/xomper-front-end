/**
 * TestEmailKind — mirrors iOS TestEmailKind enum exhaustively.
 * AI Review kinds route through POST /admin/email-test (with reportId).
 * Template kinds route through POST /admin/email-test-template (kind only).
 */
export type TestEmailKind =
  // AI Review kinds (require reportId)
  | 'weekly_recap'
  | 'week_preview'
  | 'post_draft'
  | 'preseason'
  | 'mock_draft'
  // Template kinds (no reportId)
  | 'lineup_not_set'
  | 'close_game_alert'
  | 'world_cup_matchup'
  | 'world_cup_results'
  | 'rule_proposal'
  | 'rule_accepted'
  | 'rule_denied'
  | 'taxi_steal'

/** The AI Review kinds that require a report to be selected. */
export const AI_REVIEW_KINDS: TestEmailKind[] = [
  'weekly_recap',
  'week_preview',
  'post_draft',
  'preseason',
  'mock_draft',
]

export function isAiReviewKind(kind: TestEmailKind): boolean {
  return (AI_REVIEW_KINDS as string[]).includes(kind)
}

/**
 * Display label for each kind — shown in the kind picker.
 */
export const TEST_EMAIL_KIND_LABELS: Record<TestEmailKind, string> = {
  weekly_recap: 'Weekly Recap',
  week_preview: 'Week Preview',
  post_draft: 'Post-Draft',
  preseason: 'Preseason',
  mock_draft: 'Mock Draft',
  lineup_not_set: 'Lineup Not Set',
  close_game_alert: 'Close Game Alert',
  world_cup_matchup: 'World Cup Matchup',
  world_cup_results: 'World Cup Results',
  rule_proposal: 'Rule Proposal',
  rule_accepted: 'Rule Accepted',
  rule_denied: 'Rule Denied',
  taxi_steal: 'Taxi Steal',
}

/**
 * Whitelisted user eligible for test email.
 * Mirrors iOS TestEmailRecipient.
 */
export interface TestEmailRecipient {
  userId: string
  displayName: string
  email: string
  isAdmin: boolean
}

/** Wire shape (snake_case) from GET /admin/email-test-recipients. */
export interface TestEmailRecipientRaw {
  user_id: string
  display_name: string
  email: string
  is_admin: boolean
}

export interface TestEmailRecipientsResponse {
  recipients: TestEmailRecipientRaw[]
}

export function mapTestEmailRecipient(raw: TestEmailRecipientRaw): TestEmailRecipient {
  return {
    userId: raw.user_id,
    displayName: raw.display_name,
    email: raw.email,
    isAdmin: raw.is_admin,
  }
}

/** Response from POST /admin/email-test (AI Review path). */
export interface TestEmailResponse {
  recipientEmail: string
  messageId?: string | null
  sentAt: string
  template: string
  reportType: string
  reportPeriod: string
}

export interface TestEmailResponseRaw {
  recipient_email: string
  message_id?: string | null
  sent_at: string
  template: string
  report_type: string
  report_period: string
}

export function mapTestEmailResponse(raw: TestEmailResponseRaw): TestEmailResponse {
  return {
    recipientEmail: raw.recipient_email,
    messageId: raw.message_id ?? null,
    sentAt: raw.sent_at,
    template: raw.template,
    reportType: raw.report_type,
    reportPeriod: raw.report_period,
  }
}

/** Response from POST /admin/email-test-template (template path). */
export interface TestEmailTemplateResponse {
  kind: string
  recipientEmail: string
  recipientUserId: string
  messageId?: string | null
  sentAt: string
  subject: string
}

export interface TestEmailTemplateResponseRaw {
  kind: string
  recipient_email: string
  recipient_user_id: string
  message_id?: string | null
  sent_at: string
  subject: string
}

export function mapTestEmailTemplateResponse(raw: TestEmailTemplateResponseRaw): TestEmailTemplateResponse {
  return {
    kind: raw.kind,
    recipientEmail: raw.recipient_email,
    recipientUserId: raw.recipient_user_id,
    messageId: raw.message_id ?? null,
    sentAt: raw.sent_at,
    subject: raw.subject,
  }
}
