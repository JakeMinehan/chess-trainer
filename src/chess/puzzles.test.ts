import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  fromMyOpenings,
  inThemeGroup,
  isCorrect,
  myOpeningTags,
  nextRating,
  openingTag,
  pickPuzzle,
  puzzleLine,
  solverColor,
  themeName,
  type Puzzle,
} from './puzzles'
import { mergeLine, newRoot, type MoveData } from './tree'

function line(...sans: string[]): MoveData[] {
  const chess = new Chess()
  return sans.map((san) => {
    const m = chess.move(san)
    return { uci: m.lan, san: m.san, fen: m.after }
  })
}

// Scholar's mate set-up: Black blunders with ...Nf6, White mates with Qxf7#.
const scholar: Puzzle = {
  id: 'test1',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  moves: ['g8f6', 'h5f7'],
  rating: 900,
  themes: ['mate', 'mateIn1', 'opening', 'oneMove'],
  openings: ['Italian_Game', 'Italian_Game_Other_variations'],
}

describe('puzzles', () => {
  it('works out the solver’s side and the moves', () => {
    expect(solverColor(scholar)).toBe('white')
    expect(puzzleLine(scholar).map((m) => m.san)).toEqual(['Nf6', 'Qxf7#'])
  })

  it('accepts the solution, and any mate on the last move', () => {
    const [, mate] = puzzleLine(scholar)
    expect(isCorrect(scholar, 1, mate)).toBe(true)
    const wrong = { uci: 'h5e5', san: 'Qxe5+', fen: '' }
    expect(isCorrect({ ...scholar, moves: ['g8f6', 'h5f7'] }, 1, { ...wrong, fen: scholar.fen })).toBe(false)
  })

  it('groups themes and names them readably', () => {
    expect(inThemeGroup(scholar, 'mate1')).toBe(true)
    expect(inThemeGroup(scholar, 'fork')).toBe(false)
    expect(inThemeGroup(scholar, 'all')).toBe(true)
    expect(themeName('discoveredAttack')).toBe('Discovered attack')
    expect(themeName('crushing')).toBe('Crushing')
  })

  it('matches puzzles to the openings you play, for your side', () => {
    expect(openingTag("Queen's Gambit Declined")).toBe('Queens_Gambit_Declined')
    expect(openingTag('Caro-Kann Defense')).toBe('Caro-Kann_Defense')
    const italian = mergeLine(newRoot(), line('e4', 'e5', 'Nf3', 'Nc6', 'Bc4')).root
    const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
    const table = { [key(line('e4', 'e5', 'Nf3', 'Nc6', 'Bc4')[4].fen)]: ['C50', 'Italian Game'] as [string, string] }
    const tags = myOpeningTags([{ color: 'white', root: italian }], table)
    expect(tags.white.has('Italian_Game')).toBe(true)
    expect(fromMyOpenings(scholar, tags)).toBe(true)
    // The same opening played as Black doesn't count for a puzzle solved as White.
    expect(fromMyOpenings(scholar, { white: new Set(), black: tags.white })).toBe(false)
  })

  it('picks a puzzle near your rating, widening if needed', () => {
    const at = (rating: number, id: string) => ({ ...scholar, id, rating })
    const pool = [at(800, 'a'), at(1500, 'b'), at(2400, 'c')]
    expect(pickPuzzle(pool, 1520, () => true, () => 0)?.id).toBe('b')
    expect(pickPuzzle(pool, 1520, (p) => p.id !== 'b', () => 0)?.id).toBe('a')
    expect(pickPuzzle(pool, 1520, () => false)).toBeUndefined()
  })

  it('moves your rating up after a solve and down after a miss', () => {
    const start = { rating: 1500, games: 0 }
    expect(nextRating(start, 1500, true)).toEqual({ rating: 1530, games: 1 })
    expect(nextRating(start, 1500, false)).toEqual({ rating: 1470, games: 1 })
    // Later on, changes are smaller.
    expect(nextRating({ rating: 1500, games: 50 }, 1500, true).rating).toBe(1510)
  })
})
