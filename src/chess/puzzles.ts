// Puzzles from the Lichess puzzle database (CC0), packed by scripts/build-puzzles.mjs.
// In each puzzle the first move is the opponent's; the solver plays every
// other move after that. Every solution move is the only good move, except
// that any checkmate counts on the last move.
import { findOpening, type OpeningTable } from './openings'
import { playUci, positionInfo, turnOf, type Side } from './position'
import type { MoveData, MoveNode } from './tree'

export interface PuzzlePack {
  version: 1
  source: string
  built: string
  themes: string[]
  openings: string[]
  /** [id, fen, moves, rating, theme indexes, opening indexes] */
  puzzles: [string, string, string, number, number[], number[]][]
}

export interface Puzzle {
  id: string
  /** The position before the opponent's first move. */
  fen: string
  moves: string[]
  rating: number
  themes: string[]
  /** Lichess opening tags, e.g. ["Italian_Game", "Italian_Game_Giuoco_Piano"]. */
  openings: string[]
}

export function unpack(pack: PuzzlePack): Puzzle[] {
  return pack.puzzles.map(([id, fen, moves, rating, themes, openings]) => ({
    id,
    fen,
    moves: moves.split(' '),
    rating,
    themes: themes.map((i) => pack.themes[i]),
    openings: openings.map((i) => pack.openings[i]),
  }))
}

/** The side you play: the opponent moves first, so it's the other side from the FEN. */
export function solverColor(p: Puzzle): Side {
  return turnOf(p.fen) === 'white' ? 'black' : 'white'
}

/** The puzzle's moves as MoveData (with SAN and positions), from its starting FEN. */
export function puzzleLine(p: Puzzle): MoveData[] {
  const line: MoveData[] = []
  let fen = p.fen
  for (const uci of p.moves) {
    const move = playUci(fen, uci)
    if (!move) break
    line.push(move)
    fen = move.fen
  }
  return line
}

/** True if `uci` solves this step: the expected move, or any mate on the last move. */
export function isCorrect(p: Puzzle, step: number, move: MoveData): boolean {
  if (move.uci === p.moves[step]) return true
  return step === p.moves.length - 1 && !!positionInfo(move.fen).result?.startsWith('Checkmate')
}

export const THEME_GROUPS = [
  { id: 'all', label: 'All puzzles', themes: [] },
  { id: 'mate1', label: 'Mate in 1', themes: ['mateIn1'] },
  { id: 'mate2', label: 'Mate in 2', themes: ['mateIn2'] },
  { id: 'mate3', label: 'Mate in 3 or more', themes: ['mateIn3', 'mateIn4', 'mateIn5'] },
  { id: 'fork', label: 'Forks', themes: ['fork'] },
  { id: 'pin', label: 'Pins and skewers', themes: ['pin', 'skewer'] },
  { id: 'discovered', label: 'Discovered attacks', themes: ['discoveredAttack', 'doubleCheck'] },
  { id: 'hanging', label: 'Hanging and trapped pieces', themes: ['hangingPiece', 'trappedPiece'] },
  { id: 'sacrifice', label: 'Sacrifices', themes: ['sacrifice', 'deflection', 'attraction', 'clearance'] },
  { id: 'king', label: 'Attacking the king', themes: ['kingsideAttack', 'exposedKing', 'attackingF2F7', 'backRankMate'] },
  { id: 'opening', label: 'Opening tricks', themes: ['opening'] },
  { id: 'endgame', label: 'Endgames', themes: ['endgame'] },
  { id: 'defence', label: 'Defending', themes: ['defensiveMove', 'equality'] },
] as const

const THEME_NAMES: Record<string, string> = {
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  mateIn4: 'Mate in 4',
  mateIn5: 'Mate in 5',
  attackingF2F7: 'Attacking f2/f7',
  discoveredAttack: 'Discovered attack',
  doubleCheck: 'Double check',
  hangingPiece: 'Hanging piece',
  trappedPiece: 'Trapped piece',
  backRankMate: 'Back-rank mate',
  smotheredMate: 'Smothered mate',
  kingsideAttack: 'Kingside attack',
  queensideAttack: 'Queenside attack',
  exposedKing: 'Exposed king',
  defensiveMove: 'Defensive move',
  quietMove: 'Quiet move',
  xRayAttack: 'X-ray attack',
  advancedPawn: 'Advanced pawn',
  oneMove: 'One move',
  veryLong: 'Very long',
  enPassant: 'En passant',
}

/** A readable name for a Lichess theme key, e.g. "discoveredAttack" → "Discovered attack". */
export function themeName(theme: string): string {
  if (THEME_NAMES[theme]) return THEME_NAMES[theme]
  const words = theme.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function inThemeGroup(p: Puzzle, groupId: string): boolean {
  const group = THEME_GROUPS.find((g) => g.id === groupId)
  if (!group || group.themes.length === 0) return true
  return p.themes.some((t) => (group.themes as readonly string[]).includes(t))
}

/** Turns an opening name into Lichess's tag form, e.g. "Queen's Gambit" → "Queens_Gambit". */
export function openingTag(name: string): string {
  return name.replace(/ /g, '_').replace(/[^\w-]/g, '')
}

/**
 * The Lichess opening tags (families and variations) found in your openings,
 * per side, so puzzles can be matched to the openings you actually play.
 */
export function myOpeningTags(reps: { color: Side; root: MoveNode }[], table: OpeningTable): Record<Side, Set<string>> {
  const tags: Record<Side, Set<string>> = { white: new Set(), black: new Set() }
  for (const r of reps) {
    const walk = (node: MoveNode) => {
      const name = findOpening(table, [node.fen])?.name
      if (name) {
        const [family, rest] = name.split(':')
        tags[r.color].add(openingTag(family))
        const variation = rest?.split(',')[0]?.trim()
        if (variation) tags[r.color].add(openingTag(`${family} ${variation}`))
      }
      node.children.forEach(walk)
    }
    walk(r.root)
  }
  return tags
}

export function fromMyOpenings(p: Puzzle, tags: Record<Side, Set<string>>): boolean {
  const mine = tags[solverColor(p)]
  return p.openings.some((t) => mine.has(t))
}

/** Picks a puzzle near your rating, widening the search if nothing is close. */
export function pickPuzzle(
  puzzles: Puzzle[],
  rating: number,
  accept: (p: Puzzle) => boolean,
  random = Math.random,
): Puzzle | undefined {
  const candidates = puzzles.filter(accept)
  for (const window of [100, 200, 400, 800, Infinity]) {
    const pool = candidates.filter((p) => Math.abs(p.rating - rating) <= window)
    if (pool.length) return pool[Math.floor(random() * pool.length)]
  }
  return undefined
}

export interface PuzzleRating {
  rating: number
  games: number
}

export const START_RATING: PuzzleRating = { rating: 1500, games: 0 }

/** Elo-style update: moves faster for your first puzzles so it finds your level quickly. */
export function nextRating(current: PuzzleRating, puzzleRating: number, solved: boolean): PuzzleRating {
  const k = current.games < 10 ? 60 : current.games < 40 ? 32 : 20
  const expected = 1 / (1 + 10 ** ((puzzleRating - current.rating) / 400))
  const rating = Math.round(Math.min(3200, Math.max(400, current.rating + k * ((solved ? 1 : 0) - expected))))
  return { rating, games: current.games + 1 }
}
