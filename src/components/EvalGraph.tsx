import type { MouseEvent } from 'react'
import { whiteWinChance, type Score } from '../chess/engine'
import type { Mark } from '../chess/review'

interface Props {
  /** One score per position: the start, then after each move. */
  scores: Score[]
  marks: (Mark | null)[]
  /** The number of moves played at the position on the board, if it's in the game. */
  current: number | null
  onSelect(ply: number): void
}

const W = 600
const H = 80

/** White's winning chances across the game. Tap anywhere to jump to that move. */
export function EvalGraph({ scores, marks, current, onSelect }: Props) {
  const n = Math.max(scores.length - 1, 1)
  const x = (i: number) => (i / n) * W
  const y = (i: number) => H * (1 - whiteWinChance(scores[i]))
  const line = scores.map((_, i) => `${x(i).toFixed(1)},${y(i).toFixed(1)}`).join(' L')
  const area = `M0,${H} L${line} L${W},${H} Z`

  const select = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onSelect(Math.max(0, Math.min(n, Math.round(((e.clientX - rect.left) / rect.width) * n))))
  }

  return (
    <svg className="eval-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={select} role="img" aria-label="How the evaluation changed during the game">
      <rect width={W} height={H} className="eval-graph-black" />
      <path d={area} className="eval-graph-white" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="eval-graph-mid" />
      {current !== null && <line x1={x(current)} x2={x(current)} y1={0} y2={H} className="eval-graph-current" />}
      {marks.map((m, i) =>
        m === 'mistake' || m === 'blunder' ? (
          <circle key={i} cx={x(i + 1)} cy={y(i + 1)} r={m === 'blunder' ? 5 : 4} className={`eval-graph-dot ${m}`} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
    </svg>
  )
}
