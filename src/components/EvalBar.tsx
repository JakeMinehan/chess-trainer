import { formatScore, whiteWinChance, type EngineLine } from '../chess/engine'
import type { Side } from '../chess/position'

/** A short score for the bar: "0.3", "12", or "M3" for mate. */
function shortScore(line: EngineLine): string {
  if (line.mate !== undefined) return `M${Math.abs(line.mate)}`
  const pawns = Math.abs(line.cp ?? 0) / 100
  return pawns >= 10 ? pawns.toFixed(0) : pawns.toFixed(1)
}

/**
 * White's share of the bar grows as White's position gets better. The score
 * sits at the end of whichever side is ahead.
 */
export function EvalBar({ line, orientation }: { line?: EngineLine; orientation: Side }) {
  const white = whiteWinChance(line) * 100
  const whiteAhead = !line || (line.mate !== undefined ? line.mate > 0 : (line.cp ?? 0) >= 0)
  const atBottom = whiteAhead === (orientation === 'white')
  return (
    <div
      className={`evalbar${orientation === 'black' ? ' flipped' : ''}`}
      role="img"
      aria-label={line ? `Evaluation ${formatScore(line)}` : 'Evaluation'}
    >
      <div className="evalbar-white" style={{ height: `${white}%` }} />
      {line && (
        <span className={`evalbar-score ${atBottom ? 'bottom' : 'top'} ${whiteAhead ? 'on-white' : 'on-black'}`}>
          {shortScore(line)}
        </span>
      )}
    </div>
  )
}
