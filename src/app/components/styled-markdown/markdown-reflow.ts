/**
 * Port of iOS MarkdownReflow.paragraphs(_:).
 *
 * Lightweight post-processor that injects paragraph breaks into
 * AI Review report bodies. Claude generates recaps as one long run
 * with bold + em-dash markers but no `\n\n` between sections.
 * We reflow at render time so legacy stored content still resolves cleanly.
 *
 * Rules applied in order, each idempotent:
 * 1. Detach title from first sentence (TitleRecapThe 2025… → …\n\n The 2025…)
 * 2. Pull markdown headings (#/##/###) onto their own lines with blank-line padding
 * 3. Break before bold section headers followed by em-dash (ktatich — Picks…)
 * 4. Break before non-bold manager-style header patterns
 * 5. Break before "Round N" / "Week N" / "Final … standings"
 * 6. Break before section-marker phrases (Game by Game, Around the League, etc.)
 * 7. Break before pick stems that hug prior text
 * 8. Collapse 3+ newlines to exactly two; trim
 * 9. Split long paragraphs (>260 chars) at the sentence boundary closest to midpoint
 */
export function paragraphs(raw: string): string {
  if (!raw) return raw

  let out = raw

  // 1. Detach a leading title that's glued to the first sentence
  //    e.g. "2025 Rookie Draft RecapThe 2025 class…"
  out = out.replace(/(Recap|Standings|Summary|Review)([A-Z\u{1F3C6}\u{1F947}\u{1F948}\u{1F949}⚡️])/gu, '$1\n\n$2')

  // 2. Pull every markdown heading onto its own line with blank-line padding.
  out = out.replace(/\s*(#{1,3}\s+[^\n]+)/g, '\n\n$1\n\n')

  // 3. Break before any bold section header followed by an em-dash
  //    e.g. "**ktatich (Kyle)** — Picks 1.02…"
  out = out.replace(/(?<=[.!?)]) *(\*\*[^*]+\*\*\s*—)/g, '\n\n$1')

  // 4. Break before non-bold manager-style header pattern:
  //    "word (Name) — Picks?"
  out = out.replace(/(?<=[.!?])([A-Za-z][A-Za-z0-9_]* *\([^)]+\) *— *Picks?\b)/g, '\n\n$1')

  // 5. Break before "Round N" / "Week N" / "Final … standings"
  out = out.replace(/(?<=[a-z).]) *((Round|Week) +\d+|Final[^.\n]{0,40}?standings)/g, '\n\n$1')

  // 6. Break before section-marker phrases
  out = out.replace(
    /(?<=[a-z).]) *((?:Game by Game|Around the League|Winners? (?:& |and )Losers?|Team-by-Team|Final 20\d\d standings)\b)/g,
    '\n\n$1',
  )

  // 7. Break before pick stems that hug prior text
  out = out.replace(/(?<=[.!?])(?=[A-Z][a-zA-Z' ]+ \d+\.\d{2}\b)/g, '\n\n')

  // 8. Collapse 3+ newlines to two; trim
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  // 9. Within-paragraph reflow — split paragraphs >260 chars at nearest sentence boundary
  out = out
    .split('\n\n')
    .map(chunk => splitLongParagraph(chunk, 260, 2))
    .join('\n\n')

  return out
}

function splitLongParagraph(paragraph: string, maxLen: number, maxSplits: number): string {
  const trimmed = paragraph.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('>')) return paragraph
  if (trimmed.length <= maxLen || maxSplits === 0) return paragraph

  const boundaries = sentenceBoundaries(trimmed)
  if (boundaries.length === 0) return paragraph

  const mid = Math.floor(trimmed.length / 2)
  const best = boundaries.reduce((prev, cur) =>
    Math.abs(cur - mid) < Math.abs(prev - mid) ? cur : prev,
  )

  const left = trimmed.slice(0, best).trim()
  const right = trimmed.slice(best).trim()
  const rightSplit = splitLongParagraph(right, maxLen, maxSplits - 1)
  return left + '\n\n' + rightSplit
}

function sentenceBoundaries(text: string): number[] {
  const out: number[] = []
  for (let i = 0; i < text.length - 2; i++) {
    const c = text[i]
    if (c === '.' || c === '!' || c === '?') {
      if (text[i + 1] === ' ' && text[i + 2] === text[i + 2].toUpperCase() && text[i + 2] !== text[i + 2].toLowerCase()) {
        out.push(i + 2)
      }
    }
  }
  return out
}
