// Game review: scores every position with Stockfish and marks moves that
// threw away winning chances, using the same thresholds as Lichess.
import { BatchEngine, whiteWinChance, type Score } from './engine'
import { positionInfo, turnOf } from './position'
import { START_FEN, type MoveData } from './tree'

export type Mark = 'inaccuracy' | 'mistake' | 'blunder'

export const REVIEW_DEPTH = 12

export const MARK_SYMBOL: Record<Mark, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' }

/**
 * Marks each move by how much it lowered the mover's chance of winning
 * (on Lichess's −1…1 scale: 0.1 inaccuracy, 0.2 mistake, 0.3 blunder).
 * `scores` has one entry per position: the start, then after each move.
 */
export function classify(scores: Score[]): (Mark | null)[] {
  const marks: (Mark | null)[] = []
  for (let i = 0; i + 1 < scores.length; i++) {
    const before = whiteWinChance(scores[i])
    const after = whiteWinChance(scores[i + 1])
    const whiteMoved = i % 2 === 0
    const drop = 2 * (whiteMoved ? before - after : after - before)
    marks.push(drop >= 0.3 ? 'blunder' : drop >= 0.2 ? 'mistake' : drop >= 0.1 ? 'inaccuracy' : null)
  }
  return marks
}

export interface MarkCounts {
  inaccuracy: number
  mistake: number
  blunder: number
}

export function countMarks(marks: (Mark | null)[], side: 'white' | 'black'): MarkCounts {
  const counts = { inaccuracy: 0, mistake: 0, blunder: 0 }
  marks.forEach((m, i) => {
    if (m && (i % 2 === 0) === (side === 'white')) counts[m]++
  })
  return counts
}

/** Scores the start position and the position after every move. */
export async function reviewGame(
  moves: MoveData[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Score[] | null> {
  const fens = [START_FEN, ...moves.map((m) => m.fen)]
  const batch = new BatchEngine()
  const scores: Score[] = []
  try {
    for (const fen of fens) {
      if (signal?.aborted) return null
      const info = positionInfo(fen)
      if (info.result?.startsWith('Checkmate')) {
        // The side to move has been mated.
        scores.push({ mate: turnOf(fen) === 'white' ? -1 : 1 })
      } else if (info.result) {
        scores.push({ cp: 0 })
      } else {
        const line = await batch.evaluate(fen, REVIEW_DEPTH)
        scores.push(line?.mate !== undefined ? { mate: line.mate } : { cp: line?.cp ?? 0 })
      }
      onProgress(scores.length, fens.length)
    }
    return scores
  } finally {
    batch.terminate()
  }
}
