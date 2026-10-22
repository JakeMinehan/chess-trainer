import { useEffect, useRef } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import type { Side } from '../chess/position'

interface Props {
  fen: string
  orientation: Side
  turn: Side
  check: boolean
  dests: Map<Key, Key[]>
  lastMove?: Key[]
  shapes: DrawShape[]
  onMove(from: Key, to: Key): void
  /** Which side may move. Defaults to the side to move; null locks the board. */
  movableColor?: Side | null
  /** Change this to put the pieces back to `fen`, e.g. after a move was refused. */
  resetKey?: number
}

/** The Lichess board (Chessground). Pieces can be dragged or tapped. */
export function Board({ fen, orientation, turn, check, dests, lastMove, shapes, onMove, movableColor, resetKey }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  useEffect(() => {
    api.current = Chessground(el.current!, {
      animation: { duration: 160 },
      premovable: { enabled: false },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (from, to) => onMoveRef.current(from, to) } },
    })
    return () => {
      api.current?.destroy()
      api.current = null
    }
  }, [])

  useEffect(() => {
    const color = movableColor === undefined ? turn : (movableColor ?? undefined)
    api.current?.set({
      fen,
      orientation,
      turnColor: turn,
      check,
      lastMove,
      movable: { color, dests },
      drawable: { autoShapes: shapes },
    })
  }, [fen, orientation, turn, check, dests, lastMove, shapes, movableColor, resetKey])

  return (
    <div className="board">
      <div ref={el} className="board-inner" />
    </div>
  )
}
