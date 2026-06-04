import { AiReportType } from './ai-report-type.enum'

/**
 * TS port of iOS AIReport.
 * Wire format is snake_case; the service maps to camelCase on ingestion.
 */
export interface AiReport {
  id: string
  leagueId: string
  reportType: AiReportType
  period: string
  bodyMarkdown: string
  metadata: Record<string, unknown>
  createdAt: string        // ISO-8601 string
  model: string | null
  promptVersion: string | null
}

/** Wire shape returned by GET /ai-reports/latest?type=... */
export interface AiReportLatestResponse {
  report: AiReportRaw | null
}

/** Raw snake_case object as it arrives from the Lambda. */
export interface AiReportRaw {
  id: string
  league_id: string
  report_type: AiReportType
  period: string
  body_markdown: string
  metadata: Record<string, unknown>
  created_at: string
  model: string | null
  prompt_version: string | null
}

/** Map the wire shape to the camelCase model. */
export function mapAiReport(raw: AiReportRaw): AiReport {
  return {
    id: raw.id,
    leagueId: raw.league_id,
    reportType: raw.report_type,
    period: raw.period,
    bodyMarkdown: raw.body_markdown,
    metadata: raw.metadata ?? {},
    createdAt: raw.created_at,
    model: raw.model ?? null,
    promptVersion: raw.prompt_version ?? null,
  }
}

/** Display title derived from type + period (mirrors iOS AIReport.displayTitle). */
export function aiReportDisplayTitle(report: AiReport): string {
  const typeLabel: Record<AiReportType, string> = {
    weekly: 'Weekly Recap',
    preseason: 'Pre-Season Report',
    postDraft: 'Post-Draft Report',
    mock: 'Mock Draft Report',
  }
  return `${typeLabel[report.reportType]} — ${report.period}`
}

/** First ~200 chars of body markdown, stripped of markdown syntax. */
export function aiReportPreviewSnippet(report: AiReport, maxLength = 200): string {
  const plain = report.bodyMarkdown
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
  return plain.length > maxLength ? plain.slice(0, maxLength) + '…' : plain
}
