import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  addMove,
  countLines,
  countMoves,
  deleteAt,
  mainlineFrom,
  mergeLine,
  mergeTree,
  newRoot,
  nodeAt,
  positionKeys,
  promote,
  setComment,
  toPgn,
  type MoveData,
  type MoveNode,
} from './tree'

/** Turns SAN moves into a line of MoveData. */
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

describe('move tree', () => {
  it('adds moves and finds them by path', () => {
    const [e4, e5] = line('e4', 'e5')
    let root = addMove(newRoot(), [], e4)
    root = addMove(root, ['e2e4'], e5)
    expect(nodeAt(root, ['e2e4', 'e7e5'])?.san).toBe('e5')
    // Adding the same move again changes nothing.
    expect(addMove(root, [], e4)).toBe(root)
  })

  it('merges lines, counting only new moves', () => {
    const first = mergeLine(newRoot(), line('e4', 'c5', 'Nf3'))
    expect(first.added).toBe(3)
    const second = mergeLine(first.root, line('e4', 'c5', 'c3'))
    expect(second.added).toBe(1)
    expect(countLines(second.root)).toBe(2)
    expect(countMoves(second.root)).toBe(4)
    expect(mergeLine(second.root, line('e4', 'c5')).added).toBe(0)
  })

  it('deletes a move and everything after it', () => {
    const root = tree(['e4', 'c5', 'Nf3'], ['e4', 'c5', 'c3'])
    const pruned = deleteAt(root, ['e2e4', 'c7c5', 'g1f3'])
    expect(countLines(pruned)).toBe(1)
    expect(nodeAt(pruned, ['e2e4', 'c7c5', 'c2c3'])).toBeDefined()
  })

  it('promotes a side line to the main line', () => {
    const root = promote(tree(['e4', 'e5'], ['e4', 'c5']), ['e2e4', 'c7c5'])
    expect(mainlineFrom(root, [])).toEqual(['e2e4', 'c7c5'])
  })

  it('merges two trees without losing moves', () => {
    const a = tree(['d4', 'd5', 'c4'])
    const b = tree(['d4', 'd5', 'Nf3'], ['e4'])
    const { root, added } = mergeTree(a, b)
    expect(added).toBe(2)
    expect(countLines(root)).toBe(3)
  })

  it('recognises the same position reached by a different move order', () => {
    const keys = positionKeys(tree(['d4', 'Nf6', 'c4']))
    const other = line('c4', 'Nf6', 'd4')
    expect(keys.has(other[2].fen.split(' ').slice(0, 4).join(' '))).toBe(true)
  })

  it('writes PGN with variations and notes', () => {
    let root = tree(['e4', 'e5', 'Nf3'], ['e4', 'c5'])
    root = setComment(root, ['e2e4', 'c7c5'], 'The Sicilian')
    expect(toPgn(root, { Event: 'Test' })).toBe(
      '[Event "Test"]\n[Result "*"]\n\n1. e4 e5 (1... c5 { The Sicilian }) 2. Nf3 *\n',
    )
  })
})
