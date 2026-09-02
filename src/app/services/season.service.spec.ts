/**
 * "i dont like choosing year here. i feel like year (or season) should be
 * picker at top left too just like league. default to this season obviously"
 *
 * Season was a row of buttons inside the matchups page, so it read as that
 * page's filter rather than a mode the whole app is in.
 */
import { SeasonService } from './season.service'
import { getCurrentSeason } from 'src/app/constants/season'

describe('SeasonService', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('defaults to the current season', () => {
    expect(new SeasonService().selected).toBe(getCurrentSeason())
  })

  it('remembers a choice across sessions', () => {
    new SeasonService().select('2023')

    expect(new SeasonService().selected).toBe('2023')
  })

  it('offers seasons newest first', () => {
    const s = new SeasonService()
    s.setAvailable(['2022', '2024', '2023'])

    expect(s.available).toEqual(['2024', '2023', '2022'])
  })

  it('drops duplicates and blanks', () => {
    const s = new SeasonService()
    s.setAvailable(['2024', '2024', ''])

    expect(s.available).toEqual(['2024'])
  })

  it('falls back when the remembered season is not in this league', () => {
    const s = new SeasonService()
    s.select('2019')

    s.setAvailable(['2024', '2023'])

    // Switching to a league that started last year leaves a remembered season
    // naming nothing, and the page would read as empty rather than wrong.
    expect(s.selected).toBe('2024')
  })

  it('keeps the remembered season when the league does have it', () => {
    const s = new SeasonService()
    s.select('2023')

    s.setAvailable(['2024', '2023'])

    expect(s.selected).toBe('2023')
  })

  it('leaves the selection alone when nothing is available yet', () => {
    const s = new SeasonService()
    s.select('2023')

    s.setAvailable([])

    expect(s.selected).toBe('2023')
  })

  it('resets to the current season for a league switch', () => {
    const s = new SeasonService()
    s.setAvailable(['2024', '2023'])
    s.select('2023')

    s.reset()

    // A new league has its own chain; offering the old one's seasons would
    // list years it never played.
    expect(s.available).toEqual([])
    expect(s.selected).toBe(getCurrentSeason())
  })

  it('survives blocked storage', () => {
    const original = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('blocked')
    }

    expect(() => new SeasonService().select('2023')).not.toThrow()

    localStorage.setItem = original
  })
})
