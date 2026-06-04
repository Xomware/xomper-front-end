import { parse, MarkdownBlock } from './markdown-block-parser'

describe('markdown-block-parser: parse()', () => {
  it('returns empty array for empty string', () => {
    expect(parse('')).toEqual([])
  })

  it('parses h1 block', () => {
    const result = parse('# Title Here')
    expect(result).toEqual([{ kind: 'h1', text: 'Title Here' }])
  })

  it('parses h2 block', () => {
    const result = parse('## Section Header')
    expect(result).toEqual([{ kind: 'h2', text: 'Section Header' }])
  })

  it('parses h3 block', () => {
    const result = parse('### Sub Header')
    expect(result).toEqual([{ kind: 'h3', text: 'Sub Header' }])
  })

  it('parses blockquote block', () => {
    const result = parse('> This is a quote')
    expect(result).toEqual([{ kind: 'quote', text: 'This is a quote' }])
  })

  it('parses paragraph block', () => {
    const result = parse('This is a plain paragraph.')
    expect(result).toEqual([{ kind: 'paragraph', text: 'This is a plain paragraph.' }])
  })

  it('collapses internal newlines in a paragraph', () => {
    const result = parse('Line one\nline two\nline three')
    expect(result).toEqual([{ kind: 'paragraph', text: 'Line one line two line three' }])
  })

  it('splits multiple blocks on \\n\\n', () => {
    const md = '# Title\n\n## Section\n\nA paragraph here.'
    const result = parse(md)
    expect(result.length).toBe(3)
    expect(result[0]).toEqual({ kind: 'h1', text: 'Title' })
    expect(result[1]).toEqual({ kind: 'h2', text: 'Section' })
    expect(result[2]).toEqual({ kind: 'paragraph', text: 'A paragraph here.' })
  })

  it('skips empty chunks', () => {
    const md = '# Title\n\n\n\n## Section'
    const result = parse(md)
    expect(result.length).toBe(2)
  })

  it('handles inline **bold** in paragraph text (preserves markers for renderer)', () => {
    const result = parse('This has **bold text** in it.')
    expect(result).toEqual([{ kind: 'paragraph', text: 'This has **bold text** in it.' }])
  })

  it('smoke test — full recap sample parses all block types', () => {
    const md = [
      '# 2025 Post-Draft Recap',
      '## Overall Impressions',
      '### Round 1 Summary',
      '> The league is in great shape.',
      '**ktatich (Kyle)** — Picks 1.02, 2.07. A solid draft overall.',
    ].join('\n\n')

    const result = parse(md)
    const kinds = result.map((b: MarkdownBlock) => b.kind)
    expect(kinds).toEqual(['h1', 'h2', 'h3', 'quote', 'paragraph'])
  })
})
