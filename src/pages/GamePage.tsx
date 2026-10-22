import { useEffect, useMemo, useRef, useState } from 'react'
import { EvalGraph } from '../components/EvalGraph'
import { Icon } from '../components/Icon'
import { Workspace } from '../components/Workspace'
import type { Side } from '../chess/position'
import { buildPrepIndex, checkPrep, describePrep } from '../chess/prep'
import { classify, countMarks, reviewGame, REVIEW_DEPTH, type Mark, type MarkCounts } from '../chess/review'
import { mergeLine, moveLabel, newRoot, type MoveNode, type Path } from '../chess/tree'
import { navigate } from '../lib/router'
import { toast } from '../lib/toast'
import { getGame, listRepertoires, saveGame, saveRepertoire, type Repertoire, type StoredGame } from '../storage/db'
import { formatDate } from './GamesPage'

const PLURAL = { blunder: 'blunders', mistake: 'mistakes', inaccuracy: 'inaccuracies' }

function markSummary(counts: MarkCounts): string {
  const parts = (['blunder', 'mistake', 'inaccuracy'] as const)
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${counts[k] === 1 ? k : PLURAL[k]}`)
  return parts.length ? parts.join(' · ') : 'No mistakes'
}

/** One imported game: where it left your openings, plus a Stockfish review. */
export function GamePage({ id }: { id: string }) {
  const [game, setGame] = useState<StoredGame | null | undefined>(undefined)
  const [reps, setReps] = useState<Repertoire[]>([])
  const [root, setRoot] = useState<MoveNode>(newRoot)
  const [path, setPath] = useState<Path>([])
  const [orientation, setOrientation] = useState<Side>('white')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    Promise.all([getGame(id), listRepertoires()]).then(([g, r]) => {
      setGame(g ?? null)
      setReps(r)
      if (!g) return
      setRoot(mergeLine(newRoot(), g.moves).root)
      setOrientation(g.myColor)
      // Start at the move where the game left your openings, if it did.
      const prep = checkPrep(g.moves, g.myColor, buildPrepIndex(r.filter((x) => x.color === g.myColor)))
      if ('ply' in prep) setPath(g.moves.slice(0, prep.ply + 1).map((m) => m.uci))
    })
    return () => abort.current?.abort()
  }, [id])

  const prep = useMemo(
    () => (game ? checkPrep(game.moves, game.myColor, buildPrepIndex(reps.filter((r) => r.color === game.myColor))) : null),
    [game, reps],
  )
  const marks = useMemo(() => (game?.review ? classify(game.review.scores) : null), [game])
  const markMap = useMemo(() => {
    const map = new Map<string, Mark>()
    marks?.forEach((m, i) => m && game && map.set(game.moves.slice(0, i + 1).map((x) => x.uci).join(' '), m))
    return map
  }, [marks, game])

  if (game === undefined) return null
  if (game === null || !prep) {
    return (
      <div className="page empty">
        <p>This game isn't saved on this device.</p>
        <a href="#/games">Back to games</a>
      </div>
    )
  }

  const opponent = game.myColor === 'white' ? game.black : game.white
  const repName = (repId: string) => reps.find((r) => r.id === repId)?.name ?? 'your opening'
  // Where the board is in the game (null if you've wandered into your own variation).
  const current = path.every((uci, i) => game.moves[i]?.uci === uci) ? path.length : null

  const addToOpening = async (repId: string, upTo: number) => {
    const rep = reps.find((r) => r.id === repId)
    if (!rep) return
    const line = game.moves.slice(0, upTo)
    const { root: merged, added } = mergeLine(rep.root, line)
    await saveRepertoire({ ...rep, root: merged, updatedAt: Date.now() })
    toast(added ? `Added ${added} move${added === 1 ? '' : 's'} to ${rep.name}` : `Already in ${rep.name}`)
    navigate(`/openings/${rep.id}/${line.map((m) => m.uci).join(',')}`)
  }

  const runReview = async () => {
    abort.current = new AbortController()
    setProgress({ done: 0, total: game.moves.length + 1 })
    const scores = await reviewGame(game.moves, (done, total) => setProgress({ done, total }), abort.current.signal)
    setProgress(null)
    if (!scores) return
    const reviewed = { ...game, review: { depth: REVIEW_DEPTH, scores } }
    setGame(reviewed)
    await saveGame(reviewed)
  }

  const label = 'ply' in prep ? moveLabel(game.moves[prep.ply].san, prep.ply + 1, true) : ''
  const repId = 'repIds' in prep ? prep.repIds[0] : undefined

  const notice = (
    <>
      <div className={`prep-card ${prep.kind}`}>
        <p>{describePrep(prep, game.moves, game.myColor)}</p>
        {prep.kind === 'they-left' && repId && (
          <button className="btn" onClick={() => addToOpening(repId, prep.ply + 1)}>
            <Icon name="plus" /> Add {label} to {repName(repId)}
          </button>
        )}
        {prep.kind === 'end' && repId && prep.ply < game.moves.length && (
          <button className="btn" onClick={() => addToOpening(repId, prep.ply + 1)}>
            <Icon name="plus" /> Extend {repName(repId)} with {label}
          </button>
        )}
        {prep.kind === 'you-left' && repId && (
          <button className="btn" onClick={() => navigate(`/openings/${repId}/${game.moves.slice(0, prep.ply).map((m) => m.uci).join(',')}`)}>
            <Icon name="book" /> See your line in {repName(repId)}
          </button>
        )}
        {prep.kind === 'none' && (
          <button className="btn" onClick={() => navigate('/openings')}>
            <Icon name="book" /> Go to my openings
          </button>
        )}
      </div>

      <div className="review-card">
        {game.review && marks ? (
          <>
            <EvalGraph
              scores={game.review.scores}
              marks={marks}
              current={current}
              onSelect={(ply) => setPath(game.moves.slice(0, ply).map((m) => m.uci))}
            />
            <p className="small">
              <strong>You:</strong> {markSummary(countMarks(marks, game.myColor))}
              <br />
              <strong>{opponent.name}:</strong> {markSummary(countMarks(marks, game.myColor === 'white' ? 'black' : 'white'))}
            </p>
          </>
        ) : progress ? (
          <>
            <p className="small">
              Reviewing with Stockfish… {progress.done} of {progress.total} positions
            </p>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="small muted">Stockfish checks every move and marks inaccuracies (?!), mistakes (?) and blunders (??).</p>
            <button className="btn primary" onClick={runReview}>
              <Icon name="target" /> Review game
            </button>
          </>
        )}
      </div>
    </>
  )

  return (
    <>
      <header className="page-head rep-head">
        <a className="icon-btn" href="#/games" aria-label="Back to games">
          <Icon name="back" />
        </a>
        <div className="rep-title">
          <h1>
            vs {opponent.name} <span className="muted">({opponent.rating})</span>
          </h1>
          <span className="muted">
            <span className={`side-dot ${game.myColor}`} /> {game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw'} ·{' '}
            {game.timeClass} · {formatDate(game.endTime)}
            {game.opening && ` · ${game.opening.name}`}
          </span>
        </div>
        <a className="icon-btn" href={game.url} target="_blank" rel="noopener noreferrer" aria-label="Open on chess.com">
          <Icon name="external" />
        </a>
      </header>
      <Workspace
        root={root}
        path={path}
        orientation={orientation}
        onChange={(nextRoot, nextPath) => {
          setRoot(nextRoot)
          setPath(nextPath)
        }}
        onFlip={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
        notice={notice}
        marks={markMap}
        engineDisabled={!!progress}
      />
    </>
  )
}
