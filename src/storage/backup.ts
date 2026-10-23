import { PUZZLE_RATING_KEY, type PuzzleRating } from '../chess/puzzles'
import { mergeTree, toPgn, type MoveNode } from '../chess/tree'
import { DEFAULT_PREFS, getPrefs, setPrefs, type Prefs } from '../lib/prefs'
import {
  getMeta,
  getRepertoire,
  listLineStats,
  listPuzzleStats,
  listRepertoires,
  saveLineStats,
  savePuzzleStats,
  saveRepertoire,
  setMeta,
  type LineStats,
  type PuzzleStats,
  type Repertoire,
} from './db'
import { betterRating, cleanSettings, isLineStats, isNewer, isPuzzleStats, isRating } from './merge'

export interface BackupSettings {
  prefs: Partial<Prefs>
  /** "on" or "off" for the Stockfish switch. */
  engine?: string
}

/**
 * Version 1 files hold only openings. Version 2 adds practice history, puzzle
 * history, the puzzle rating and settings (imported games aren't included:
 * they can be imported again from chess.com).
 */
export interface BackupFile {
  app: 'chess-trainer'
  version: 1 | 2
  exportedAt: string
  repertoires: Repertoire[]
  practice?: LineStats[]
  puzzles?: PuzzleStats[]
  puzzleRating?: PuzzleRating
  settings?: BackupSettings
}

export const LAST_BACKUP_KEY = 'lastBackupAt'

function readEnginePref(): string | undefined {
  try {
    return localStorage.getItem('engine') ?? undefined
  } catch {
    return undefined
  }
}

export async function createBackup(): Promise<BackupFile> {
  const [repertoires, practice, puzzles, puzzleRating] = await Promise.all([
    listRepertoires(),
    listLineStats(),
    listPuzzleStats(),
    getMeta<PuzzleRating>(PUZZLE_RATING_KEY),
  ])
  return {
    app: 'chess-trainer',
    version: 2,
    exportedAt: new Date().toISOString(),
    repertoires,
    practice,
    puzzles,
    ...(puzzleRating ? { puzzleRating } : {}),
    settings: { prefs: getPrefs(), engine: readEnginePref() },
  }
}

function isNode(value: unknown): value is MoveNode {
  const n = value as MoveNode
  return (
    !!n && typeof n.fen === 'string' && typeof n.uci === 'string' && Array.isArray(n.children) && n.children.every(isNode)
  )
}

export function parseBackup(text: string): BackupFile {
  let data: BackupFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a Chess Trainer backup.")
  }
  if (data?.app !== 'chess-trainer' || !Array.isArray(data.repertoires)) {
    throw new Error("That file isn't a Chess Trainer backup.")
  }
  for (const r of data.repertoires) {
    const valid =
      typeof r.id === 'string' && typeof r.name === 'string' && ['white', 'black'].includes(r.color) && isNode(r.root)
    if (!valid) throw new Error('The backup file is damaged.')
  }
  const damaged =
    (data.practice !== undefined && !(Array.isArray(data.practice) && data.practice.every(isLineStats))) ||
    (data.puzzles !== undefined && !(Array.isArray(data.puzzles) && data.puzzles.every(isPuzzleStats))) ||
    (data.puzzleRating !== undefined && !isRating(data.puzzleRating))
  if (damaged) throw new Error('The backup file is damaged.')
  return data
}

export interface RestoreResult {
  openings: number
  moves: number
  /** Lines whose practice history came from the backup. */
  practice: number
  /** Puzzles whose history came from the backup. */
  puzzles: number
  rating: boolean
  settings: boolean
}

/**
 * Restores a backup without losing anything. Openings: missing moves are
 * added and new openings are added as they are. Practice and puzzle history:
 * the more recent record of each line or puzzle is kept. Puzzle rating: the
 * one with more rated puzzles behind it is kept. Settings: the backup's.
 */
export async function restoreBackup(backup: BackupFile): Promise<RestoreResult> {
  const result: RestoreResult = { openings: 0, moves: 0, practice: 0, puzzles: 0, rating: false, settings: false }

  for (const r of backup.repertoires) {
    const existing = await getRepertoire(r.id)
    if (!existing) {
      await saveRepertoire(r)
      result.openings++
      continue
    }
    const { root, added } = mergeTree(existing.root, r.root)
    if (added) {
      await saveRepertoire({ ...existing, root, updatedAt: Date.now() })
      result.moves += added
    }
  }

  if (backup.practice?.length) {
    const current = new Map((await listLineStats()).map((s) => [s.key, s]))
    for (const s of backup.practice) {
      if (isNewer(s, current.get(s.key))) {
        await saveLineStats(s)
        result.practice++
      }
    }
  }

  if (backup.puzzles?.length) {
    const current = new Map((await listPuzzleStats()).map((s) => [s.id, s]))
    for (const s of backup.puzzles) {
      if (isNewer(s, current.get(s.id))) {
        await savePuzzleStats(s)
        result.puzzles++
      }
    }
  }

  const rating = betterRating(await getMeta<PuzzleRating>(PUZZLE_RATING_KEY), backup.puzzleRating)
  if (rating) {
    await setMeta(PUZZLE_RATING_KEY, rating)
    result.rating = true
  }

  if (backup.settings) {
    setPrefs(cleanSettings(backup.settings.prefs, DEFAULT_PREFS))
    if (backup.settings.engine === 'on' || backup.settings.engine === 'off') {
      try {
        localStorage.setItem('engine', backup.settings.engine)
      } catch {
        // Not saved; the engine switch keeps its current setting.
      }
    }
    result.settings = true
  }

  return result
}

/** "Restored 2 openings, practice for 5 lines and settings." */
export function describeRestore(r: RestoreResult): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const parts = [
    r.openings && plural(r.openings, 'opening'),
    r.moves && plural(r.moves, 'extra move'),
    r.practice && `practice for ${plural(r.practice, 'line')}`,
    r.puzzles && plural(r.puzzles, 'puzzle result'),
    r.rating && 'your puzzle rating',
    r.settings && 'settings',
  ].filter((p): p is string => !!p)
  if (!parts.length) return 'Nothing new in that backup'
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `Restored ${list}`
}

export function repertoirePgn(r: Repertoire): string {
  return toPgn(r.root, {
    Event: r.name,
    Site: 'Chess Trainer',
    White: r.color === 'white' ? 'Me' : '?',
    Black: r.color === 'black' ? 'Me' : '?',
  })
}

export function fileSafe(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_ ]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'opening'
  )
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hands a file to the user: the share sheet on phones (so it can go to Google
 * Drive, Files, email…), otherwise a normal download.
 */
export async function saveFile(name: string, text: string, type: string): Promise<SaveResult> {
  const file = new File([text], name, { type })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}

export async function backUpNow(): Promise<SaveResult> {
  const backup = await createBackup()
  const date = new Date().toISOString().slice(0, 10)
  const result = await saveFile(`chess-trainer-backup-${date}.json`, JSON.stringify(backup), 'application/json')
  if (result !== 'cancelled') await setMeta(LAST_BACKUP_KEY, Date.now())
  return result
}
