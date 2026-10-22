import { openDB, type DBSchema } from 'idb'
import type { Score } from '../chess/engine'
import type { Side } from '../chess/position'
import { newRoot, type MoveData, type MoveNode } from '../chess/tree'

export interface Repertoire {
  id: string
  name: string
  /** The side you play in this repertoire. */
  color: Side
  root: MoveNode
  createdAt: number
  updatedAt: number
}

export interface GamePlayer {
  name: string
  rating: number
}

/** A game imported from chess.com. */
export interface StoredGame {
  id: string
  url: string
  white: GamePlayer
  black: GamePlayer
  myColor: Side
  result: 'win' | 'loss' | 'draw'
  timeClass: string
  endTime: number
  moves: MoveData[]
  opening?: { eco: string; name: string }
  /** Stockfish evaluation of every position, from White's side (moves + 1 entries). */
  review?: { depth: number; scores: Score[] }
}

/** How well you know one line, for spaced repetition. */
export interface LineStats {
  /** `${repertoireId}|${path}` */
  key: string
  /** 0 = still learning; each clean run moves it up a box and spaces reviews further apart. */
  box: number
  /** When the line is next due (ms). */
  due: number
  passes: number
  fails: number
  last: number
}

/** Your history with one puzzle. Missed puzzles come back for review (Leitner boxes, like lines). */
export interface PuzzleStats {
  id: string
  attempts: number
  /** How the first, rated attempt went. */
  firstResult: 'solved' | 'failed'
  lastResult: 'solved' | 'failed'
  last: number
  box: number
  due: number
}

interface Schema extends DBSchema {
  repertoires: { key: string; value: Repertoire }
  meta: { key: string; value: unknown }
  games: { key: string; value: StoredGame }
  practice: { key: string; value: LineStats }
  puzzleStats: { key: string; value: PuzzleStats }
}

// Everything is stored on this device in IndexedDB. Nothing is sent anywhere.
const db = openDB<Schema>('chess-trainer', 3, {
  upgrade(database, oldVersion) {
    if (oldVersion < 1) {
      database.createObjectStore('repertoires', { keyPath: 'id' })
      database.createObjectStore('meta')
    }
    if (oldVersion < 2) {
      database.createObjectStore('games', { keyPath: 'id' })
      database.createObjectStore('practice', { keyPath: 'key' })
    }
    if (oldVersion < 3) database.createObjectStore('puzzleStats', { keyPath: 'id' })
  },
  // A newer version of the app (e.g. in another tab) needs to upgrade the
  // database; reload so this tab gets out of its way and picks up the update.
  blocking() {
    location.reload()
  },
})

function makeId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

export function newRepertoire(name: string, color: Side): Repertoire {
  const now = Date.now()
  return { id: makeId(), name, color, root: newRoot(), createdAt: now, updatedAt: now }
}

export async function listRepertoires(): Promise<Repertoire[]> {
  const all = await (await db).getAll('repertoires')
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getRepertoire(id: string): Promise<Repertoire | undefined> {
  return (await db).get('repertoires', id)
}

export async function saveRepertoire(repertoire: Repertoire): Promise<void> {
  await (await db).put('repertoires', repertoire)
  void requestPersistence()
}

export async function deleteRepertoire(id: string): Promise<void> {
  await (await db).delete('repertoires', id)
}

export async function listGames(): Promise<StoredGame[]> {
  const all = await (await db).getAll('games')
  return all.sort((a, b) => b.endTime - a.endTime)
}

export async function getGame(id: string): Promise<StoredGame | undefined> {
  return (await db).get('games', id)
}

export async function saveGame(game: StoredGame): Promise<void> {
  await (await db).put('games', game)
}

/** Adds games that aren't stored yet and returns how many were new. Existing games (and their reviews) are kept. */
export async function addGames(games: StoredGame[]): Promise<number> {
  const tx = (await db).transaction('games', 'readwrite')
  let added = 0
  for (const g of games) {
    if (!(await tx.store.getKey(g.id))) {
      await tx.store.put(g)
      added++
    }
  }
  await tx.done
  return added
}

export async function listLineStats(): Promise<LineStats[]> {
  return (await db).getAll('practice')
}

export async function saveLineStats(stats: LineStats): Promise<void> {
  await (await db).put('practice', stats)
}

export async function listPuzzleStats(): Promise<PuzzleStats[]> {
  return (await db).getAll('puzzleStats')
}

export async function savePuzzleStats(stats: PuzzleStats): Promise<void> {
  await (await db).put('puzzleStats', stats)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db).get('meta', key) as Promise<T | undefined>
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db).put('meta', value, key)
}

/**
 * Asks the browser not to clear this app's data when the device runs low on
 * space. Browsers decide for themselves; installed apps are usually allowed.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
