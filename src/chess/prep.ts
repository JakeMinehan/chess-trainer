// Compares a played game with your openings to find where it left them.
// Positions are matched rather than move orders, so transpositions count.
import type { Side } from './position'
import { START_FEN, moveLabel, positionKey, type MoveData, type MoveNode } from './tree'

interface PrepEntry {
  /** Prepared moves from this position: UCI → SAN. */
  children: Map<string, string>
  repIds: Set<string>
}

export type PrepIndex = Map<string, PrepEntry>

/** Indexes every position in the given openings (all for one side). */
export function buildPrepIndex(openings: { id: string; root: MoveNode }[]): PrepIndex {
  const index: PrepIndex = new Map()
  const walk = (node: MoveNode, repId: string) => {
    const key = positionKey(node.fen)
    let entry = index.get(key)
    if (!entry) {
      entry = { children: new Map(), repIds: new Set() }
      index.set(key, entry)
    }
    entry.repIds.add(repId)
    for (const c of node.children) {
      entry.children.set(c.uci, c.san)
      walk(c, repId)
    }
  }
  for (const o of openings) if (o.root.children.length) walk(o.root, o.id)
  return index
}

export type PrepResult =
  /** No openings saved for this side. */
  | { kind: 'none' }
  /** You played something other than your prepared move. */
  | { kind: 'you-left'; ply: number; expected: string[]; repIds: string[] }
  /** Your opponent played a move you haven't prepared for. */
  | { kind: 'they-left'; ply: number; repIds: string[] }
  /** The game followed your line all the way to its last move. */
  | { kind: 'end'; ply: number; repIds: string[] }
  /** Every move of the game was in your openings. */
  | { kind: 'all'; repIds: string[] }

/** A one-line summary of a prep check, for lists and headers. */
export function describePrep(result: PrepResult, moves: MoveData[], myColor: Side): string {
  const label = (ply: number) => moveLabel(moves[ply].san, ply + 1, true)
  switch (result.kind) {
    case 'none':
      return `No ${myColor === 'white' ? 'White' : 'Black'} openings saved yet`
    case 'you-left':
      return `You left your line at ${label(result.ply)} (yours: ${result.expected.join(' or ')})`
    case 'they-left':
      return `New move from your opponent: ${label(result.ply)}`
    case 'end':
      return `Followed your line to the end (move ${Math.ceil(result.ply / 2)})`
    case 'all':
      return 'The whole game was in your openings'
  }
}

/** `ply` is the index of the first move that left your openings. */
export function checkPrep(moves: MoveData[], myColor: Side, index: PrepIndex): PrepResult {
  let key = positionKey(START_FEN)
  if (!index.get(key)?.children.size) return { kind: 'none' }
  for (let i = 0; i < moves.length; i++) {
    const entry = index.get(key)!
    const next = positionKey(moves[i].fen)
    if (!entry.children.has(moves[i].uci) && !index.has(next)) {
      const repIds = [...entry.repIds]
      if (entry.children.size === 0) return { kind: 'end', ply: i, repIds }
      const mine = (i % 2 === 0) === (myColor === 'white')
      return mine ? { kind: 'you-left', ply: i, expected: [...entry.children.values()], repIds } : { kind: 'they-left', ply: i, repIds }
    }
    key = next
  }
  return { kind: 'all', repIds: [...(index.get(key)?.repIds ?? [])] }
}
