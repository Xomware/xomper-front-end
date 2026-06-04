/**
 * Port of iOS MarkdownBlockParser.parse(_:).
 *
 * Splits a reflowed markdown string on `\n\n` boundaries and classifies
 * each chunk into a typed MarkdownBlock. Expected to receive output from
 * `paragraphs()` (markdown-reflow.ts) so headings are already isolated.
 */
export type MarkdownBlock =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'paragraph'; text: string }

/**
 * Parse reflowed markdown into typed blocks.
 * Matching iOS exactly:
 *   - "### " → h3
 *   - "## "  → h2
 *   - "# "   → h1
 *   - "> "   → quote
 *   - else   → paragraph (internal newlines collapsed to space)
 */
export function parse(md: string): MarkdownBlock[] {
  const chunks = md.split('\n\n')
  const blocks: MarkdownBlock[] = []

  for (const chunk of chunks) {
    const trimmed = chunk.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: trimmed.slice(4).trim() })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: trimmed.slice(3).trim() })
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: trimmed.slice(2).trim() })
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: trimmed.slice(2).trim() })
    } else {
      // Paragraph — collapse internal newlines into spaces so a
      // wrapped paragraph from the AI doesn't render with hard line breaks.
      const joined = trimmed.replace(/\n/g, ' ')
      blocks.push({ kind: 'paragraph', text: joined })
    }
  }

  return blocks
}
