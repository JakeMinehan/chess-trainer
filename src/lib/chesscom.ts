// Imports your games from chess.com's public API. No login or key is needed:
// https://www.chess.com/news/view/published-data-api
import { findOpening, loadOpenings } from '../chess/openings'
import { parsePgn, startsNormally } from '../chess/pgn'
import { lineAt, mainlineFrom } from '../chess/tree'
import { addGames, getMeta, setMeta, type StoredGame } from '../storage/db'

interface ApiPlayer {
  username: string
  rating: number
  result: string
}

interface ApiGame {
  url: string
  pgn?: string
  time_class: string
  rules: string
  end_time: number
  white: ApiPlayer
  black: ApiPlayer
}

export interface ChessComSettings {
  username: string
  /** Monthly archives already imported in full (older months never change). */
  loaded: string[]
}

export const CHESSCOM_KEY = 'chesscom'

const API = 'https://api.chess.com/pub/player'
const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error("Couldn't reach chess.com. Check your connection.")
  }
  if (res.status === 404) throw new Error('chess.com has no player with that username.')
  if (!res.ok) throw new Error(`chess.com said no (error ${res.status}). Try again in a minute.`)
  return res.json()
}

/** Turns a chess.com game into the stored form, or null for variants and broken games. */
function toStoredGame(g: ApiGame, username: string, openings: Awaited<ReturnType<typeof loadOpenings>>): StoredGame | null {
  if (g.rules !== 'chess' || !g.pgn) return null
  const [parsed] = parsePgn(g.pgn)
  if (!parsed || !startsNormally(parsed) || parsed.problems.length) return null
  const moves = lineAt(parsed.root, mainlineFrom(parsed.root, []))
  if (!moves.length) return null
  const myColor = g.white.username.toLowerCase() === username.toLowerCase() ? 'white' : 'black'
  const mine = g[myColor].result
  const result = mine === 'win' ? 'win' : DRAWS.has(mine) ? 'draw' : 'loss'
  // Ids look like "live-123456789" so they are safe to use in links.
  const id = g.url.split('/').slice(-2).join('-')
  const opening = findOpening(
    openings,
    moves.slice(0, 30).map((m) => m.fen),
  )
  return {
    id,
    url: g.url,
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    myColor,
    result,
    timeClass: g.time_class,
    endTime: g.end_time * 1000,
    moves,
    ...(opening ? { opening } : {}),
  }
}

async function importMonth(archiveUrl: string, username: string): Promise<number> {
  const [data, openings] = await Promise.all([getJson<{ games: ApiGame[] }>(archiveUrl), loadOpenings()])
  const games = data.games.map((g) => toStoredGame(g, username, openings)).filter((g): g is StoredGame => !!g)
  return addGames(games)
}

/**
 * Imports the newest games: always re-reads the current month, and the month
 * before it if that hasn't been imported yet. Returns how many games were new.
 */
export async function importLatest(username: string): Promise<{ added: number; settings: ChessComSettings }> {
  const saved = await getMeta<ChessComSettings>(CHESSCOM_KEY)
  const settings: ChessComSettings =
    saved && saved.username.toLowerCase() === username.toLowerCase() ? saved : { username, loaded: [] }
  const { archives } = await getJson<{ archives: string[] }>(`${API}/${encodeURIComponent(username.toLowerCase())}/games/archives`)
  let added = 0
  const recent = archives.slice(-2).reverse()
  for (const [i, url] of recent.entries()) {
    if (i > 0 && settings.loaded.includes(url)) continue
    added += await importMonth(url, username)
    // Only past months are finished; the current month keeps getting new games.
    if (i > 0) settings.loaded = [...new Set([...settings.loaded, url])]
  }
  await setMeta(CHESSCOM_KEY, settings)
  return { added, settings }
}

/** Imports the newest month that hasn't been imported yet. Returns null when there are no older months. */
export async function importOlder(settings: ChessComSettings): Promise<{ added: number; month: string; settings: ChessComSettings } | null> {
  const { archives } = await getJson<{ archives: string[] }>(
    `${API}/${encodeURIComponent(settings.username.toLowerCase())}/games/archives`,
  )
  const url = archives
    .slice(0, -1)
    .reverse()
    .find((a) => !settings.loaded.includes(a))
  if (!url) return null
  const added = await importMonth(url, settings.username)
  const next = { ...settings, loaded: [...settings.loaded, url] }
  await setMeta(CHESSCOM_KEY, next)
  const [year, month] = url.split('/').slice(-2)
  const label = new Date(Number(year), Number(month) - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return { added, month: label, settings: next }
}
