import { Component, Input, OnChanges, SecurityContext } from '@angular/core'
import { NgFor, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { MarkdownBlock, parse } from './markdown-block-parser'
import { paragraphs } from './markdown-reflow'

/** Rendered version of a MarkdownBlock — adds the sanitized innerHTML for text blocks. */
interface RenderedBlock {
  kind: MarkdownBlock['kind']
  text: string
  safeHtml: SafeHtml
}

/**
 * Block-switch markdown renderer. Port of iOS StyledMarkdownView.
 *
 * Accepts raw markdown, runs it through `paragraphs()` (reflow) then `parse()`
 * (typed blocks), then renders each block with iOS-identical visual hierarchy:
 *   h1   → white title
 *   h2   → red 3px top bar + uppercase red text with letter-spacing
 *   h3   → gold subheader
 *   quote → gold 3px left bar + italic emerald-tinted body
 *   paragraph → body text with **bold** via [innerHTML] + DomSanitizer
 *
 * No `marked` / `ngx-markdown` dependency.
 */
@Component({
  selector: 'app-styled-markdown',
  standalone: true,
  imports: [NgFor, NgSwitch, NgSwitchCase, NgSwitchDefault],
  templateUrl: './styled-markdown.component.html',
  styleUrls: ['./styled-markdown.component.scss'],
})
export class StyledMarkdownComponent implements OnChanges {
  @Input() markdown = ''

  blocks: RenderedBlock[] = []

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    const rawBlocks = parse(paragraphs(this.markdown))
    this.blocks = rawBlocks.map(b => ({
      kind: b.kind,
      text: b.text,
      safeHtml: this.toSafeHtml(b.text),
    }))
  }

  /**
   * Convert **bold** markers to <strong> tags.
   * Uses DomSanitizer.bypassSecurityTrustHtml on the escaped+processed string.
   * Text is HTML-escaped first so user content can't inject raw tags,
   * then only the **...** → <strong> substitution is applied.
   */
  toSafeHtml(text: string): SafeHtml {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    return this.sanitizer.bypassSecurityTrustHtml(withBold)
  }
}
