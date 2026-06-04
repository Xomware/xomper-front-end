import { paragraphs } from './markdown-reflow'

describe('markdown-reflow: paragraphs()', () => {
  it('returns empty string unchanged', () => {
    expect(paragraphs('')).toBe('')
  })

  it('Rule 1 — detaches title from first sentence', () => {
    const input = '2025 Rookie Draft RecapThe 2025 class was loaded.'
    const out = paragraphs(input)
    expect(out).toContain('Recap\n\nThe')
  })

  it('Rule 2 — pulls h2 headings onto their own line', () => {
    // Realistic input: heading glued to prior text with no blank line
    const input = 'Some intro text.\n## Game by Game\nMore text here.'
    const out = paragraphs(input)
    expect(out).toContain('## Game by Game')
    // Heading should be surrounded by blank lines after reflow
    expect(out).toMatch(/\n\n## Game by Game\n\n/)
  })

  it('Rule 2 — pulls h3 headings onto their own line', () => {
    const input = 'Intro.\n### Week 4\nMore text.'
    const out = paragraphs(input)
    expect(out).toContain('### Week 4')
  })

  it('Rule 3 — breaks before bold section header + em-dash', () => {
    const input = 'Great pick.**ktatich (Kyle)** — Picks 1.02 through 4.07.'
    const out = paragraphs(input)
    expect(out).toContain('\n\n**ktatich (Kyle)**')
  })

  it('Rule 5 — breaks before "Round N"', () => {
    const input = 'End of round.Round 2 begins here.'
    const out = paragraphs(input)
    expect(out).toContain('\n\nRound 2')
  })

  it('Rule 5 — breaks before "Week N"', () => {
    const input = 'Recap done.Week 4 was wild.'
    const out = paragraphs(input)
    expect(out).toContain('\n\nWeek 4')
  })

  it('Rule 6 — breaks before "Game by Game"', () => {
    const input = 'Season summary.Game by Game breakdown follows.'
    const out = paragraphs(input)
    expect(out).toContain('\n\nGame by Game')
  })

  it('Rule 6 — breaks before "Around the League"', () => {
    const input = 'Top recap.Around the League notes follow.'
    const out = paragraphs(input)
    expect(out).toContain('\n\nAround the League')
  })

  it('Rule 8 — collapses 3+ newlines to exactly 2', () => {
    const input = 'Para one.\n\n\n\nPara two.'
    const out = paragraphs(input)
    expect(out).not.toContain('\n\n\n')
    expect(out).toContain('\n\n')
  })

  it('Rule 9 — splits a long paragraph at sentence boundary near midpoint', () => {
    // Build a >260-char paragraph with sentence boundaries (no headings or quotes)
    const sentence1 = 'This is the first sentence with enough words to make it comfortably long when combined with the others. '
    const sentence2 = 'This is the second sentence that continues on with even more text and substantive detail here. '
    const sentence3 = 'And this is the third and final sentence which finishes off the paragraph very nicely indeed.'
    const input = sentence1 + sentence2 + sentence3
    expect(input.length).toBeGreaterThan(260)
    const out = paragraphs(input)
    expect(out).toContain('\n\n')
  })

  it('smoke test — real recap sample parses without error', () => {
    const sample = `# 2025 Post-Draft Recap

## Overall Impressions

**ktatich (Kyle)** — Picks 1.02 through 4.07. Kyle had a dominant draft.Round 2 saw some surprises.

### Final Standings

> The league is in great shape heading into the season.`
    const out = paragraphs(sample)
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain('## Overall Impressions')
  })
})
