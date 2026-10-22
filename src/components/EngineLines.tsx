import { formatScore, MAX_DEPTH, type EngineState } from '../chess/engine'
import { nextPly, uciLineToSan } from '../chess/position'
import { moveLabel } from '../chess/tree'

interface Props {
  enabled: boolean
  onToggle(): void
  analysis: EngineState | null
  fen: string
  /** Called with the first move of a line when it is tapped. */
  onPlay(uci: string): void
}

function lineText(fen: string, pv: string[]): string {
  const ply = nextPly(fen)
  return uciLineToSan(fen, pv, 10)
    .map((san, i) => moveLabel(san, ply + i, i === 0))
    .join(' ')
}

export function EngineLines({ enabled, onToggle, analysis, fen, onPlay }: Props) {
  const best = analysis?.lines[0]
  return (
    <section className="engine">
      <div className="engine-head">
        <button
          className={`switch${enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label="Stockfish analysis"
          onClick={onToggle}
        >
          <span />
        </button>
        <span className="engine-name">Stockfish {__STOCKFISH_VERSION__}</span>
        {enabled && (
          <span className="muted engine-depth">
            {analysis ? `depth ${analysis.depth}/${MAX_DEPTH}` : 'starting…'}
          </span>
        )}
        {enabled && best && <span className="engine-score">{formatScore(best)}</span>}
      </div>
      {enabled && (
        <div className="engine-lines">
          {analysis?.lines.map((line) => (
            <button key={line.multipv} className="engine-line" onClick={() => onPlay(line.pv[0])}>
              <span className="score">{formatScore(line)}</span>
              <span className="pv">{lineText(fen, line.pv)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
