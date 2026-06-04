import { AiReport } from './ai-report.model'
import { AiReportType } from './ai-report-type.enum'

/**
 * Options passed to AiReviewService.trigger().
 * Mirrors iOS WeeklyTriggerRequest + the simpler trigger shapes.
 *
 * week: omit key entirely (not null) when absent — backend defaults to nfl_state.week - 1.
 * seasonsBack: omit key entirely when absent — backend treats as 0.
 */
export interface AiReviewTriggerOpts {
  dryRun: boolean
  force: boolean
  week?: number
  seasonsBack?: number
}

/**
 * Wire shape returned by all four trigger endpoints.
 * report is null on dry-run when the backend writes the row but
 * doesn't broadcast — iOS handles this as "dry run sent".
 * previews is populated when report is present (or dry-run single-user).
 */
export interface AiReviewTriggerResponseRaw {
  success: boolean
  report?: AiReportRaw | null
  previews?: AiReviewPreviewRaw[]
  dry_run?: boolean
  message?: string
}

/** Raw shape from the wire (snake_case). */
export interface AiReportRaw {
  pk: string
  sk: string
  id?: string
  league_id: string
  report_type: AiReportType
  period: string
  body_markdown: string
  metadata: Record<string, unknown>
  created_at: string
  model: string | null
  prompt_version: string | null
}

/** One recipient preview entry. */
export interface AiReviewPreviewRaw {
  user_id: string
  display_name: string
  email: string
  subject: string
  body_html?: string
  body_markdown?: string
}

/** Camel-cased preview entry used in components. */
export interface AiReviewPreview {
  userId: string
  displayName: string
  email: string
  subject: string
  bodyHtml?: string
  bodyMarkdown?: string
}

/** Camel-cased trigger response used in components. */
export interface AiReviewTriggerResponse {
  success: boolean
  report: AiReport | null
  previews: AiReviewPreview[]
  dryRun: boolean
  message?: string
}

/** Response shape from POST /admin/reports-flag */
export interface ReportFlagResponseRaw {
  success: boolean
  metadata: Record<string, string>
}

export interface ReportFlagResponse {
  success: boolean
  metadata: Record<string, string>
}
