import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core'
import { NgStyle } from '@angular/common'
import {
  AiReport,
  aiReportFormattedPeriod,
  aiReportPreviewSnippet,
  aiReportTypeAccentColor,
  aiReportTypeDisplayName,
} from 'src/app/models/ai-report.model'

/**
 * Shared row component for the AI Review archive list and the landing headline card.
 * Mirrors iOS AIReportCardRow.
 *
 * Layout: [type chip] [period] [snippet, 3-line clamp] [relative date] [chevron]
 */
@Component({
  selector: 'app-ai-report-card-row',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './ai-report-card-row.component.html',
  styleUrls: ['./ai-report-card-row.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiReportCardRowComponent {
  @Input({ required: true }) report!: AiReport
  @Output() tap = new EventEmitter<void>()

  get typeLabel(): string {
    return aiReportTypeDisplayName(this.report.reportType).toUpperCase()
  }

  get accentColor(): string {
    return aiReportTypeAccentColor(this.report.reportType)
  }

  get formattedPeriod(): string {
    return aiReportFormattedPeriod(this.report.period)
  }

  get snippet(): string {
    return aiReportPreviewSnippet(this.report)
  }

  get relativeDate(): string {
    return formatRelativeDate(this.report.createdAt)
  }

  onClick(): void {
    this.tap.emit()
  }
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (diffDay < 1) return rtf.format(-diffHour || -1, 'hour')
  if (diffDay < 7) return rtf.format(-diffDay, 'day')
  if (diffWeek < 5) return rtf.format(-diffWeek, 'week')
  return rtf.format(-diffMonth, 'month')
}
