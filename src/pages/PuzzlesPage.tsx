import { useEffect, useMemo, useRef, useState } from 'react'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { Board } from '../components/Board'
import { Icon } from '../components/Icon'
import { Workspace } from '../components/Workspace'
import { loadOpenings } from '../chess/openings'
import { legalDests, playMove, positionInfo, turnOf, type Side } from '../chess/position'
import { isDue, nextSchedule } from '../chess/practice'
import {
  START_RATING,
  THEME_GROUPS,
  fromMyOpenings,
  inThemeGroup,
  isCorrect,
  myOpeningTags,
  nextRating,
  pickPuzzle,
  puzzleLine,
  solverColor,
  themeName,
  unpack,
  type Puzzle,
  type PuzzlePack,
  type PuzzleRating,
} from '../chess/puzzles'
import { mergeLine, newRoot, type MoveData, type MoveNode, type Path } from '../chess/tree'
import { setPref, usePrefs } from '../lib/prefs'
import { play, playMove as playMoveSound } from '../lib/sound'
import { getMeta, listPuzzleStats, listRepertoires, savePuzzleStats, setMeta, type PuzzleStats } from '../storage/db'

const RATING_KEY = 'puzzleRating'
/** Missed puzzles come back until they've been solved this many times in a row. */
const RETIRE_BOX = 3
const NO_DESTS = new Map<Key, Key[]>()

let pack: Promise<Puzzle[]> | null = null
function loadPuzzles(): Promise<Puzzle[]> {
  pack ??= fetch(`${import.meta.env.BASE_URL}puzzles.json`)
    .then((r) => r.json() as Promise<PuzzlePack>)
    .then(unpack)
    .catch((e) => {
      pack = null
      throw e
    })
  return pack
}

/** The switch at the top of the Practice tab. */
export function PracticeSwitch({ current }: { current: 'lines' | 'puzzles' }) {
  return (
    <div className="segmented page-switch" role="tablist">
      <a href="#/practice" role="tab" aria-selected={current === 'lines'} className={current === 'lines' ? 'selected' : ''}>
        <Icon name="target" size={18} /> My lines
      </a>
      <a href="#/puzzles" role="tab" aria-selected={current === 'puzzles'} className={current === 'puzzles' ? 'selected' : ''}>
        <Icon name="puzzle" size={18} /> Puzzles
      </a>
    </div>
  )
}

interface Current {
  puzzle: Puzzle
  /** Reviews and repeats don't change your rating. */
  rated: boolean
}

export function PuzzlesPage() {
  const prefs = usePrefs()
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null)
  const [failedToLoad, setFailedToLoad] = useState(false)
  const [tags, setTags] = useState<Record<Side, Set<string>>>({ white: new Set(), black: new Set() })
  const [stats, setStats] = useState<Map<string, PuzzleStats>>(new Map())
  const [rating, setRating] = useState<PuzzleRating>(START_RATING)
  const [current, setCurrentPuzzle] = useState<Current | null>(null)
  // Bumped for every new puzzle so the board always starts fresh, even for a repeat.
  const [round, setRound] = useState(0)
  const setCurrent = (next: Current | null) => {
    setCurrentPuzzle(next)
    setAnalysis(null)
    if (next) setRound((r) => r + 1)
  }
  const [analysis, setAnalysis] = useState<{ root: MoveNode; path: Path; orientation: Side } | null>(null)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    loadPuzzles().then(setPuzzles, () => setFailedToLoad(true))
    Promise.all([listRepertoires(), loadOpenings()]).then(([reps, table]) => setTags(myOpeningTags(reps, table)))
    listPuzzleStats().then((s) => setStats(new Map(s.map((x) => [x.id, x]))))
    getMeta<PuzzleRating>(RATING_KEY).then((r) => r && setRating(r))
  }, [])

  const filter = (p: Puzzle) => inThemeGroup(p, prefs.puzzleTheme) && (!prefs.puzzleMine || fromMyOpenings(p, tags))
  const available = useMemo(() => puzzles?.filter(filter).length ?? 0, [puzzles, prefs.puzzleTheme, prefs.puzzleMine, tags])
  const mineCount = useMemo(() => puzzles?.filter((p) => fromMyOpenings(p, tags)).length ?? 0, [puzzles, tags])
  const now = Date.now()
  const reviews = [...stats.values()].filter((s) => s.firstResult === 'failed' && s.box < RETIRE_BOX && isDue(s, now))

  const nextPuzzle = () => {
    if (!puzzles) return
    // New puzzles first; once every matching puzzle has been tried, allow repeats (unrated).
    const fresh = pickPuzzle(puzzles, rating.rating, (p) => filter(p) && !stats.has(p.id) && !seen.current.has(p.id))
    const puzzle = fresh ?? pickPuzzle(puzzles, rating.rating, (p) => filter(p) && !seen.current.has(p.id))
    if (!puzzle) return
    seen.current.add(puzzle.id)
    setCurrent({ puzzle, rated: !!fresh })
  }

  const nextReview = () => {
    const due = reviews.find((s) => !seen.current.has(s.id)) ?? reviews[0]
    const puzzle = due && puzzles?.find((p) => p.id === due.id)
    if (!puzzle) return nextPuzzle()
    seen.current.add(puzzle.id)
    setCurrent({ puzzle, rated: false })
  }

  /** Saves the result; returns the rating change for rated puzzles. */
  const record = async (puzzle: Puzzle, solved: boolean, rated: boolean): Promise<number | null> => {
    const old = stats.get(puzzle.id)
    const next: PuzzleStats = {
      id: puzzle.id,
      attempts: (old?.attempts ?? 0) + 1,
      firstResult: old?.firstResult ?? (solved ? 'solved' : 'failed'),
      lastResult: solved ? 'solved' : 'failed',
      last: Date.now(),
      ...nextSchedule(old, solved, Date.now()),
    }
    setStats((m) => new Map(m).set(puzzle.id, next))
    await savePuzzleStats(next)
    if (!rated) return null
    const updated = nextRating(rating, puzzle.rating, solved)
    setRating(updated)
    await setMeta(RATING_KEY, updated)
    return updated.rating - rating.rating
  }

  const analysisView = analysis && current && (
    <>
      <header className="page-head rep-head">
          <button className="icon-btn" onClick={() => setAnalysis(null)} aria-label="Back to the puzzle">
            <Icon name="back" />
          </button>
          <div className="rep-title">
            <h1>Puzzle analysis</h1>
            <span className="muted">Rated {current.puzzle.rating} · {current.puzzle.themes.map(themeName).slice(0, 3).join(' · ')}</span>
          </div>
        </header>
        <Workspace
          root={analysis.root}
          path={analysis.path}
          orientation={analysis.orientation}
          onChange={(root, path) => setAnalysis((a) => a && { ...a, root, path })}
          onFlip={() => setAnalysis((a) => a && { ...a, orientation: a.orientation === 'white' ? 'black' : 'white' })}
        />
    </>
  )

  if (current) {
    // The puzzle stays mounted (just hidden) while you analyse it, so coming back keeps your result.
    return (
      <>
        {analysisView}
        <div hidden={!!analysisView}>
          <PuzzleBoard
            key={round}
            puzzle={current.puzzle}
            rated={current.rated}
            rating={rating.rating}
            onResult={(solved) => record(current.puzzle, solved, current.rated)}
            onNext={() => (reviews.length && !current.rated ? nextReview() : nextPuzzle())}
            onStop={() => setCurrent(null)}
            onAnalyse={() =>
              setAnalysis({
                root: mergeLine(newRoot(current.puzzle.fen), puzzleLine(current.puzzle)).root,
                path: [current.puzzle.moves[0]],
                orientation: solverColor(current.puzzle),
              })
            }
          />
        </div>
      </>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Practice</h1>
      </header>
      <PracticeSwitch current="puzzles" />

      {failedToLoad ? (
        <div className="empty">
          <p>The puzzles haven't downloaded yet.</p>
          <p className="muted">Open the app once while you're online and they'll be saved for offline use.</p>
        </div>
      ) : !puzzles ? (
        <p className="muted">Loading puzzles…</p>
      ) : (
        <>
          <section className="card rating-card">
            <span className="muted small">Your puzzle rating</span>
            <span className="rating-number">{rating.rating}</span>
            <span className="muted small">
              {rating.games ? `${rating.games} rated puzzle${rating.games === 1 ? '' : 's'}` : 'Starts at 1500 and finds your level as you play'}
            </span>
          </section>

          <section className="card">
            <h2>Puzzles</h2>
            <label className="field">
              <span>Theme</span>
              <select value={prefs.puzzleTheme} onChange={(e) => setPref('puzzleTheme', e.target.value)}>
                {THEME_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`choice${prefs.puzzleMine ? ' selected' : ''}${mineCount ? '' : ' disabled'}`}>
              <input
                type="checkbox"
                checked={prefs.puzzleMine}
                disabled={!mineCount}
                onChange={(e) => setPref('puzzleMine', e.target.checked)}
              />
              <span className="choice-name">From my openings</span>
              <span className="muted small choice-meta">{mineCount ? `${mineCount} puzzles` : 'Add openings first'}</span>
            </label>
            <p className="muted small">
              {available.toLocaleString()} puzzle{available === 1 ? '' : 's'} match. Puzzles are picked near your rating.
            </p>
          </section>

          <button className="btn primary big" onClick={nextPuzzle} disabled={!available}>
            <Icon name="play" /> Start puzzles
          </button>
          {reviews.length > 0 && (
            <button className="btn big" onClick={nextReview}>
              <Icon name="reset" /> Review {reviews.length} missed puzzle{reviews.length === 1 ? '' : 's'}
            </button>
          )}
          <p className="muted small">Puzzles from the Lichess puzzle database (public domain). They work offline.</p>
        </>
      )}
    </div>
  )
}

interface BoardProps {
  puzzle: Puzzle
  rated: boolean
  rating: number
  onResult(solved: boolean): Promise<number | null>
  onNext(): void
  onStop(): void
  onAnalyse(): void
}

function PuzzleBoard({ puzzle, rated, rating, onResult, onNext, onStop, onAnalyse }: BoardProps) {
  const line = useMemo(() => puzzleLine(puzzle), [puzzle])
  const me = solverColor(puzzle)
  const [ply, setPly] = useState(0)
  const [status, setStatus] = useState<'playing' | 'wrong' | 'solved' | 'shown'>('playing')
  const [slipped, setSlipped] = useState(false)
  const [showing, setShowing] = useState(false)
  const [hint, setHint] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [change, setChange] = useState<number | null>(null)
  /** A different mate than the one in the database, played on the last move. */
  const [otherMate, setOtherMate] = useState<MoveData | null>(null)
  const reported = useRef(false)

  const done = status === 'solved' || status === 'shown'
  const finished = ply >= line.length
  const lastPlayed = ply === 0 ? undefined : finished && otherMate ? otherMate : line[ply - 1]
  const fen = lastPlayed?.fen ?? puzzle.fen
  const yourTurn = !done && !finished && !showing && ply % 2 === 1
  const info = useMemo(() => positionInfo(fen), [fen])
  const dests = useMemo(() => (yourTurn ? legalDests(fen) : NO_DESTS), [fen, yourTurn])
  const lastMove = useMemo(() => (lastPlayed ? [lastPlayed.uci.slice(0, 2), lastPlayed.uci.slice(2, 4)] as Key[] : undefined), [lastPlayed])
  const expected = puzzle.moves[ply]
  const shapes = useMemo<DrawShape[]>(() => (hint && expected ? [{ orig: expected.slice(0, 2) as Key, brush: 'green' }] : []), [hint, expected])

  const report = async (solved: boolean) => {
    if (reported.current) return
    reported.current = true
    setChange(await onResult(solved))
  }

  // The app plays the opponent's moves (and, when showing the solution, yours too).
  useEffect(() => {
    if (done || finished || (ply % 2 === 1 && !showing)) return
    const timer = setTimeout(() => setPly((p) => p + 1), ply === 0 ? 700 : showing ? 650 : 450)
    return () => clearTimeout(timer)
  }, [ply, done, finished, showing])

  // A sound for every move played.
  const lastPly = useRef(0)
  useEffect(() => {
    if (ply > lastPly.current && lastPlayed) playMoveSound(lastPlayed.san)
    lastPly.current = ply
  }, [ply, lastPlayed])

  // The end of the line: solved (or the solution has been shown).
  useEffect(() => {
    if (!finished || done) return
    setStatus(showing ? 'shown' : 'solved')
    if (!showing && !slipped) void report(true)
    setTimeout(() => play(showing || slipped ? 'notify' : 'success'), 200)
  }, [finished])

  const fail = () => {
    setSlipped(true)
    void report(false)
  }

  const onMove = (from: Key, to: Key) => {
    const move = playMove(fen, from, to)
    if (!move) return
    if (isCorrect(puzzle, ply, move)) {
      if (move.uci !== expected) setOtherMate(move)
      setPly(ply + 1)
      setHint(false)
      setStatus('playing')
    } else {
      fail()
      setStatus('wrong')
      setResetKey((k) => k + 1)
      play('error')
    }
  }

  const showSolution = () => {
    fail()
    setHint(false)
    setShowing(true)
  }

  const retry = () => {
    setPly(0)
    lastPly.current = 0
    setStatus('playing')
    setShowing(false)
    setHint(false)
    setOtherMate(null)
  }

  const side = me === 'white' ? 'White' : 'Black'
  let message: string
  if (status === 'solved') message = slipped ? 'Done, but not first time.' : 'Solved!'
  else if (status === 'shown') message = "Here's the solution."
  else if (status === 'wrong') message = "That's not it. Try again."
  else if (showing) message = 'Showing the solution…'
  else if (yourTurn) message = `Find the best move for ${side}.`
  else message = `${turnOf(fen) === 'white' ? 'White' : 'Black'} is moving…`

  return (
    <div className="workspace">
      <div className="board-col">
        <div className="board-row">
          <Board
            fen={fen}
            orientation={me}
            turn={turnOf(fen)}
            check={info.check}
            dests={dests}
            lastMove={lastMove}
            shapes={shapes}
            onMove={onMove}
            movableColor={yourTurn ? me : null}
            resetKey={resetKey}
          />
        </div>
        <div className="controls">
          <button className="icon-btn" onClick={onStop} aria-label="Back to puzzle settings" title="Back">
            <Icon name="back" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setHint(true)
              fail()
            }}
            disabled={!yourTurn}
            aria-label="Hint"
            title="Hint (counts as a miss)"
          >
            <Icon name="hint" />
          </button>
          <button className="icon-btn" onClick={showSolution} disabled={done || showing} aria-label="Show the solution" title="Show the solution">
            <Icon name="eye" />
          </button>
          <button className="icon-btn" onClick={onNext} aria-label="Next puzzle" title="Next puzzle">
            <Icon name="next" />
          </button>
        </div>
      </div>

      <div className="panel-col">
        <div className="opening-name">
          <span className={`side-dot ${me}`} /> {rated ? 'Rated puzzle' : 'Review (not rated)'}
          <span className="muted"> · your rating {rating}</span>
        </div>
        <div className={`practice-status ${status === 'solved' && !slipped ? 'good' : status === 'wrong' ? 'wrong' : ''}`}>
          {status === 'solved' && !slipped && <Icon name="check" />}
          {message}
        </div>
        {change !== null && (
          <p className={`rating-change ${change >= 0 ? 'up' : 'down'}`}>
            {change >= 0 ? '+' : '−'}
            {Math.abs(change)} rating
          </p>
        )}
        {done && (
          <>
            <div className="theme-chips">
              <span className="chip">Rated {puzzle.rating}</span>
              {puzzle.themes
                .filter((t) => !['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM'].includes(t))
                .map((t) => (
                  <span key={t} className="chip">
                    {themeName(t)}
                  </span>
                ))}
            </div>
            <div className="actions">
              <button className="btn primary" onClick={onNext}>
                <Icon name="play" /> Next puzzle
              </button>
              <button className="btn" onClick={retry}>
                <Icon name="reset" /> Retry
              </button>
              <button className="btn" onClick={onAnalyse}>
                <Icon name="board" /> Analyse
              </button>
              <a className="btn" href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noopener noreferrer">
                <Icon name="external" /> Lichess
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
