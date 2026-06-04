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

/** Wire shape returned by GET /ai-reports/list */
export interface AiReportListResponse {
  rows: AiReportRaw[]
  next_cursor: string | null
}

/**
 * Raw snake_case object as it arrives from the Lambda.
 * The backend does NOT surface a top-level `id` field — the composite id
 * is derived client-side as `pk + "|" + sk` mirroring iOS AIReport.init(from:).
 */
export interface AiReportRaw {
  pk: string
  sk: string
  /** Some responses include a top-level id; if present we prefer it. */
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

/**
 * Map the wire shape to the camelCase model.
 * Derives composite id from `pk + "|" + sk` when no top-level id is present,
 * matching iOS AIReport.init(from:).
 */
export function mapAiReport(raw: AiReportRaw): AiReport {
  const id = raw.id ?? `${raw.pk ?? ''}|${raw.sk ?? ''}`
  return {
    id,
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

/**
 * Display title derived from type + period (mirrors iOS AIReport.displayTitle).
 * Weekly/weekPreview show just the formatted period; others prefix with type name.
 */
export function aiReportDisplayTitle(report: AiReport): string {
  const formatted = aiReportFormattedPeriod(report.period)
  if (report.reportType === 'weekly' || report.reportType === 'weekPreview') {
    return formatted
  }
  const typeLabel: Record<AiReportType, string> = {
    weekly: 'Weekly',
    preseason: 'Preseason',
    postDraft: 'Post-Draft',
    weekPreview: 'Week Preview',
    mock: 'Mock Draft',
  }
  return `${typeLabel[report.reportType]} — ${formatted}`
}

/**
 * Pretty-print a period string. Mirrors iOS AIReportType.formattedPeriod.
 * "2025W17" → "Week 17 — 2025". Other types return the period unchanged.
 */
export function aiReportFormattedPeriod(period: string): string {
  const wIdx = period.indexOf('W')
  if (wIdx === -1) return period
  const season = period.slice(0, wIdx)
  const weekRaw = period.slice(wIdx + 1)
  const week = parseInt(weekRaw, 10)
  if (isNaN(week) || !season) return period
  return `Week ${week} — ${season}`
}

/**
 * First ~120 chars of body markdown, stripped of markdown syntax.
 * Mirrors iOS AIReport.previewSnippet — skips leading headings,
 * prefers first paragraph.
 */
export function aiReportPreviewSnippet(report: AiReport, maxLength = 120): string {
  const lines = report.bodyMarkdown
    .split('\n')
    .filter(l => l.trim().length > 0)
  const firstParagraph = lines.find(l => !l.trimStart().startsWith('#')) ?? lines[0] ?? ''
  const stripped = firstParagraph
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .trim()
  return stripped.length > maxLength ? stripped.slice(0, maxLength) + '…' : stripped
}

/**
 * Accent color (CSS var token) per report type.
 * Mirrors iOS AIReportType.accentColor.
 */
export function aiReportTypeAccentColor(type: AiReportType): string {
  switch (type) {
    case 'postDraft':   return 'var(--color-champion-gold)'
    case 'preseason':   return 'var(--color-success-green)'
    case 'weekly':      return 'var(--color-champion-gold)'
    case 'weekPreview': return 'var(--color-error-red)'
    case 'mock':        return 'var(--color-champion-gold)'
  }
}

/**
 * Display name for the type chip. Mirrors iOS AIReportType.displayName.
 */
export function aiReportTypeDisplayName(type: AiReportType): string {
  switch (type) {
    case 'postDraft':   return 'Post-Draft'
    case 'preseason':   return 'Preseason'
    case 'weekly':      return 'Weekly'
    case 'weekPreview': return 'Week Preview'
    case 'mock':        return 'Mock Draft'
  }
}
