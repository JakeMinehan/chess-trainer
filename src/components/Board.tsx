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
}

/** The Lichess board (Chessground). Pieces can be dragged or tapped. */
export function Board({ fen, orientation, turn, check, dests, lastMove, shapes, onMove }: Props) {
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
    api.current?.set({
      fen,
      orientation,
      turnColor: turn,
      check,
      lastMove,
      movable: { color: turn, dests },
      drawable: { autoShapes: shapes },
    })
  }, [fen, orientation, turn, check, dests, lastMove, shapes])

  return (
    <div className="board">
      <div ref={el} className="board-inner" />
    </div>
  )
}
