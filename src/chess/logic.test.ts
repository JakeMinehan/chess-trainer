import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { linesOf, nextSchedule, pickLine, BOX_DAYS } from './practice'
import { buildPrepIndex, checkPrep } from './prep'
import { classify, countMarks } from './review'
import { mergeLine, newRoot, type MoveData, type MoveNode } from './tree'

function line(...sans: string[]): MoveData[] {
  const chess = new Chess()
  return sans.map((san) => {
    const m = chess.move(san)
    return { uci: m.lan, san: m.san, fen: m.after }
  })
}

function tree(...lines: string[][]): MoveNode {
  return lines.reduce((root, l) => mergeLine(root, line(...l)).root, newRoot())
}

describe('checking a game against your openings', () => {
  const caroKann = { id: 'ck', root: tree(['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'], ['e4', 'c6', 'Nc3', 'd5']) }
  const index = buildPrepIndex([caroKann])

  it('finds where you left your own line', () => {
    const result = checkPrep(line('e4', 'c6', 'd4', 'e6'), 'black', index)
    expect(result).toEqual({ kind: 'you-left', ply: 3, expected: ['d5'], repIds: ['ck'] })
  })

  it('finds a move your opponent played that you have not prepared', () => {
    const result = checkPrep(line('e4', 'c6', 'c4', 'd5'), 'black', index)
    expect(result).toEqual({ kind: 'they-left', ply: 2, repIds: ['ck'] })
  })

  it('notices when the game reached the end of your line', () => {
    const result = checkPrep(line('e4', 'c6', 'Nc3', 'd5', 'Nf3', 'Bg4'), 'black', index)
    expect(result).toEqual({ kind: 'end', ply: 4, repIds: ['ck'] })
  })

  it('counts a transposition as still in your line', () => {
    // The 1. c4 line stops at 2. d4, but that position is also reached in the 1. d4 line, which goes on.
    const qg = buildPrepIndex([{ id: 'qg', root: tree(['d4', 'Nf6', 'c4', 'e6', 'Nc3'], ['c4', 'Nf6', 'd4']) }])
    const result = checkPrep(line('c4', 'Nf6', 'd4', 'e6', 'Nc3', 'Bb4'), 'white', qg)
    expect(result).toEqual({ kind: 'end', ply: 5, repIds: ['qg'] })
  })

  it('says so when there are no openings for that side', () => {
    expect(checkPrep(line('e4'), 'white', buildPrepIndex([]))).toEqual({ kind: 'none' })
  })
})

describe('practice', () => {
  it('lists every line that has a move for you to find', () => {
    const root = tree(['e4', 'c6', 'd4', 'd5'], ['e4', 'c6', 'Nc3'], ['d4'])
    // As Black, "1. d4" alone has no Black move, so it is left out.
    expect(linesOf('r', 'black', root).map((l) => l.path.length)).toEqual([4, 3])
    expect(linesOf('r', 'white', root).map((l) => l.yourMoves)).toEqual([2, 2, 1])
  })

  it('spaces reviews out after clean runs and resets after a mistake', () => {
    const now = 1_000_000
    const day = 24 * 60 * 60 * 1000
    const first = nextSchedule(undefined, true, now)
    expect(first).toEqual({ box: 1, due: now + BOX_DAYS[1] * day })
    const second = nextSchedule(first, true, now)
    expect(second.box).toBe(2)
    expect(nextSchedule(second, false, now)).toEqual({ box: 0, due: now })
  })

  it('prefers lines that are due and avoids repeating the last one', () => {
    const lines = linesOf('r', 'white', tree(['e4', 'e5'], ['d4', 'd5'], ['c4', 'e5']))
    const now = 10
    const schedules = new Map([[lines[0].key, { box: 3, due: now + 1000 }]])
    const picks = new Set([0, 0.5, 0.99].map((r) => pickLine(lines, schedules, now, lines[1].key, () => r)?.key))
    expect(picks).toEqual(new Set([lines[2].key]))
  })
})

describe('game review marks', () => {
  it('marks moves by how much they lowered the mover’s chances', () => {
    // White plays a fine move, Black blunders a piece, White misses the win.
    const marks = classify([{ cp: 20 }, { cp: 30 }, { cp: 350 }, { cp: 40 }])
    expect(marks).toEqual([null, 'blunder', 'blunder'])
    expect(countMarks(marks, 'black')).toEqual({ inaccuracy: 0, mistake: 0, blunder: 1 })
  })

  it('treats losing a forced mate as a blunder', () => {
    expect(classify([{ mate: 2 }, { cp: 0 }])).toEqual(['blunder'])
  })
})
