// The rules for combining a backup with what's already on the device. Kept
// free of storage code so they can be tested on their own.
import type { PuzzleRating } from '../chess/puzzles'
import type { LineStats, PuzzleStats } from './db'

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

export function isLineStats(x: unknown): x is LineStats {
  return (
    isObject(x) &&
    typeof x.key === 'string' &&
    typeof x.box === 'number' &&
    typeof x.due === 'number' &&
    typeof x.last === 'number' &&
    typeof x.passes === 'number' &&
    typeof x.fails === 'number'
  )
}

export function isPuzzleStats(x: unknown): x is PuzzleStats {
  const results = ['solved', 'failed']
  return (
    isObject(x) &&
    typeof x.id === 'string' &&
    typeof x.attempts === 'number' &&
    results.includes(x.firstResult as string) &&
    results.includes(x.lastResult as string) &&
    typeof x.last === 'number' &&
    typeof x.box === 'number' &&
    typeof x.due === 'number'
  )
}

export function isRating(x: unknown): x is PuzzleRating {
  return isObject(x) && typeof x.rating === 'number' && typeof x.games === 'number'
}

/** History from a backup wins only if it's more recent than what's on the device. */
export function isNewer(incoming: { last: number }, existing: { last: number } | undefined): boolean {
  return !existing || incoming.last > existing.last
}

/** The backup's rating wins only if more rated puzzles went into it, so an old file can't wind it back. */
export function betterRating(current: PuzzleRating | undefined, incoming: PuzzleRating | undefined): PuzzleRating | undefined {
  if (!incoming) return undefined
  return !current || incoming.games > current.games ? incoming : undefined
}

/** Keeps only settings the app knows about, with the right type. */
export function cleanSettings<T extends object>(raw: unknown, defaults: T): Partial<T> {
  if (!isObject(raw)) return {}
  const clean: Partial<T> = {}
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = raw[key as string]
    if (value !== undefined && typeof value === typeof defaults[key]) clean[key] = value as T[keyof T]
  }
  return clean
}
