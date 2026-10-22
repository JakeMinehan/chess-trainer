import { Chess, type Square } from 'chess.js'
import type { Key } from 'chessground/types'
import type { MoveData } from './tree'

export type Side = 'white' | 'black'

export function turnOf(fen: string): Side {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

/** Every legal move from each square, in the shape Chessground wants. */
export function legalDests(fen: string): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>()
  for (const m of new Chess(fen).moves({ verbose: true })) {
    const list = dests.get(m.from) ?? []
    if (!list.includes(m.to)) list.push(m.to)
    dests.set(m.from, list)
  }
  return dests
}

function toMoveData(chess: Chess, move: { from: string; to: string; promotion?: string }): MoveData | null {
  try {
    const played = chess.move(move)
    return { uci: played.lan, san: played.san, fen: played.after }
  } catch {
    return null
  }
}

/** Plays a move dragged on the board. Pawns that reach the last rank become queens. */
export function playMove(fen: string, from: Key, to: Key): MoveData | null {
  const chess = new Chess(fen)
  const promotes = chess
    .moves({ square: from as Square, verbose: true })
    .some((m) => m.to === to && m.promotion)
  return toMoveData(chess, { from, to, promotion: promotes ? 'q' : undefined })
}

export function playUci(fen: string, uci: string): MoveData | null {
  return toMoveData(new Chess(fen), { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
}

/** Engine moves (UCI) as SAN, stopping at the first move that isn't legal. */
export function uciLineToSan(fen: string, uci: string[], max = 12): string[] {
  const chess = new Chess(fen)
  const sans: string[] = []
  for (const m of uci.slice(0, max)) {
    const move = toMoveData(chess, { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
    if (!move) break
    sans.push(move.san)
  }
  return sans
}

/** The ply (half-move count) of the next move to be played from this position. */
export function nextPly(fen: string): number {
  const fullmove = Number(fen.split(' ')[5] ?? 1)
  return (fullmove - 1) * 2 + (turnOf(fen) === 'white' ? 1 : 2)
}

export interface PositionInfo {
  check: boolean
  /** Set when the game is over in this position. */
  result?: string
}

export function positionInfo(fen: string): PositionInfo {
  const chess = new Chess(fen)
  const check = chess.isCheck()
  if (chess.isCheckmate()) return { check, result: `Checkmate, ${turnOf(fen) === 'white' ? 'Black' : 'White'} wins` }
  if (chess.isStalemate()) return { check, result: 'Stalemate' }
  if (chess.isInsufficientMaterial()) return { check, result: 'Draw by insufficient material' }
  return { check }
}
