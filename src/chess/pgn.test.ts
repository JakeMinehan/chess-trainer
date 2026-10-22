import { describe, expect, it } from 'vitest'
import { parsePgn, startsNormally } from './pgn'
import { countLines, countMoves, mainlineFrom, nodeAt, toPgn } from './tree'

describe('PGN import', () => {
  it('reads moves, variations and comments', () => {
    const [game] = parsePgn(`[Event "Sicilian prep"]
[Orientation "black"]

1. e4 c5 { The Sicilian } 2. Nf3 (2. c3 d5 (2... Nf6 3. e5) 3. exd5) 2... d6 *`)
    expect(game.headers.Event).toBe('Sicilian prep')
    expect(game.headers.Orientation).toBe('black')
    expect(game.problems).toEqual([])
    expect(countLines(game.root)).toBe(3)
    expect(countMoves(game.root)).toBe(9)
    expect(nodeAt(game.root, ['e2e4', 'c7c5'])?.comment).toBe('The Sicilian')
    expect(mainlineFrom(game.root, [])).toEqual(['e2e4', 'c7c5', 'g1f3', 'd7d6'])
  })

  it('copes with annotations, 0-0 castling and moves without spaces', () => {
    const [game] = parsePgn('1.e4!? e5 2.Nf3 Nc6 3.Bc4 Bc5 4.0-0 Nf6?! $6 5.d3 *')
    expect(game.problems).toEqual([])
    expect(countMoves(game.root)).toBe(9)
    expect(nodeAt(game.root, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'])?.san).toBe('O-O')
  })

  it('reads several games and strips clock markers from chess.com', () => {
    const games = parsePgn(`[Event "Live Chess"]
[White "a"]

1. d4 {[%clk 0:02:59.9]} 1... d5 {[%clk 0:02:58]} 1-0

[Event "Second"]

1. c4 e5 0-1`)
    expect(games).toHaveLength(2)
    expect(nodeAt(games[0].root, ['d2d4'])?.comment).toBeUndefined()
    expect(games[1].headers.Event).toBe('Second')
    expect(mainlineFrom(games[1].root, [])).toEqual(['c2c4', 'e7e5'])
  })

  it('skips a variation with an illegal move but keeps the rest', () => {
    const [game] = parsePgn('1. e4 e5 (1... Ke3 2. d4) 2. Nf3 *')
    expect(game.problems).toHaveLength(1)
    expect(mainlineFrom(game.root, [])).toEqual(['e2e4', 'e7e5', 'g1f3'])
    expect(countLines(game.root)).toBe(1)
  })

  it('reads its own PGN export back exactly', () => {
    const [original] = parsePgn('1. e4 e5 (1... c5 { Sharp } 2. Nf3 (2. c3) d6) 2. Nf3 Nc6 { Main } 3. Bb5 *')
    const [copy] = parsePgn(toPgn(original.root, { Event: 'Round trip' }))
    expect(copy.root).toEqual(original.root)
  })

  it('notices games that start from a set-up position', () => {
    const [game] = parsePgn('[SetUp "1"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *')
    expect(startsNormally(game)).toBe(false)
    expect(game.root.children[0].san).toBe('e4')
  })
})
