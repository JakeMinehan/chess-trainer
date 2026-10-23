import { describe, expect, it } from 'vitest'
import { betterRating, cleanSettings, isLineStats, isNewer, isPuzzleStats, isRating } from './merge'

describe('restoring history from a backup', () => {
  it('keeps whichever record is more recent', () => {
    expect(isNewer({ last: 20 }, undefined)).toBe(true)
    expect(isNewer({ last: 20 }, { last: 10 })).toBe(true)
    expect(isNewer({ last: 10 }, { last: 20 })).toBe(false)
    expect(isNewer({ last: 10 }, { last: 10 })).toBe(false)
  })

  it('only takes the backup’s puzzle rating if more puzzles went into it', () => {
    const now = { rating: 1600, games: 40 }
    expect(betterRating(now, { rating: 1450, games: 12 })).toBeUndefined()
    expect(betterRating(now, { rating: 1700, games: 60 })).toEqual({ rating: 1700, games: 60 })
    expect(betterRating(undefined, { rating: 1500, games: 0 })).toEqual({ rating: 1500, games: 0 })
    expect(betterRating(now, undefined)).toBeUndefined()
  })

  it('keeps only known settings with the right type', () => {
    const defaults = { board: 'green', sound: 'wood', puzzleMine: false }
    const raw = { board: 'brown', sound: 3, puzzleMine: true, extra: 'ignored' }
    expect(cleanSettings(raw, defaults)).toEqual({ board: 'brown', puzzleMine: true })
    expect(cleanSettings('nonsense', defaults)).toEqual({})
  })

  it('recognises well-formed history records and rejects damaged ones', () => {
    expect(isLineStats({ key: 'r|e2e4', box: 1, due: 1, last: 1, passes: 1, fails: 0 })).toBe(true)
    expect(isLineStats({ key: 'r|e2e4', box: '1' })).toBe(false)
    const puzzle = { id: 'abc', attempts: 1, firstResult: 'failed', lastResult: 'solved', last: 1, box: 1, due: 1 }
    expect(isPuzzleStats(puzzle)).toBe(true)
    expect(isPuzzleStats({ ...puzzle, firstResult: 'maybe' })).toBe(false)
    expect(isRating({ rating: 1500, games: 3 })).toBe(true)
    expect(isRating({ rating: '1500' })).toBe(false)
  })
})
