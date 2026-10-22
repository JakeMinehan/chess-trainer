import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { Board } from '../components/Board'
import { Icon } from '../components/Icon'
import { useOpening } from '../chess/openings'
import { legalDests, playMove, positionInfo, turnOf } from '../chess/position'
import { isDue, isMoveBy, linesOf, nextSchedule, pickLine, type Line } from '../chess/practice'
import { moveLabel, nodesAlong } from '../chess/tree'
import { navigate } from '../lib/router'
import { listLineStats, listRepertoires, saveLineStats, type LineStats, type Repertoire } from '../storage/db'

interface Session {
  rep: Repertoire
  line: Line
  /** How many moves of the line have been played. */
  ply: number
  /** Wrong moves plus hints used on this line. */
  mistakes: number
  status: 'playing' | 'wrong' | 'done'
  hint: boolean
  /** Bumped to put a refused move back. */
  resetKey: number
}

const OPPONENT_DELAY = 550
const NO_DESTS = new Map<Key, Key[]>()

/** Plays your saved lines against you: the app moves for the other side, you find your moves. */
export function PracticePage({ repId }: { repId?: string }) {
  const [reps, setReps] = useState<Repertoire[] | null>(null)
  const [stats, setStats] = useState<Map<string, LineStats>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [session, setSession] = useState<Session | null>(null)
  const [tally, setTally] = useState({ lines: 0, perfect: 0 })

  useEffect(() => {
    Promise.all([listRepertoires(), listLineStats()]).then(([r, s]) => {
      setReps(r)
      setStats(new Map(s.map((x) => [x.key, x])))
      setSelected(new Set(repId && r.some((x) => x.id === repId) ? [repId] : r.map((x) => x.id)))
    })
  }, [repId])

  const linesByRep = useMemo(() => new Map((reps ?? []).map((r) => [r.id, linesOf(r.id, r.color, r.root)])), [reps])
  const pool = useMemo(() => [...selected].flatMap((id) => linesByRep.get(id) ?? []), [selected, linesByRep])
  const now = Date.now()
  const due = pool.filter((l) => isDue(stats.get(l.key), now)).length

  const start = (previousKey?: string) => {
    const line = pickLine(pool, stats, Date.now(), previousKey)
    const rep = reps?.find((r) => r.id === line?.repId)
    if (!line || !rep) return
    setSession({ rep, line, ply: 0, mistakes: 0, status: 'playing', hint: false, resetKey: 0 })
  }

  if (!reps) return null

  if (session) {
    return (
      <PracticeBoard
        session={session}
        setSession={setSession}
        lines={linesByRep.get(session.rep.id) ?? []}
        tally={tally}
        onFinished={async (clean) => {
          const key = session.line.key
          const old = stats.get(key)
          const schedule = nextSchedule(old, clean, Date.now())
          const next: LineStats = {
            key,
            ...schedule,
            passes: (old?.passes ?? 0) + (clean ? 1 : 0),
            fails: (old?.fails ?? 0) + (clean ? 0 : 1),
            last: Date.now(),
          }
          setStats((m) => new Map(m).set(key, next))
          setTally((t) => ({ lines: t.lines + 1, perfect: t.perfect + (clean ? 1 : 0) }))
          await saveLineStats(next)
        }}
        onNext={() => start(session.line.key)}
        onStop={() => setSession(null)}
      />
    )
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="page">
      <header className="page-head">
        <h1>Practice</h1>
      </header>
      <p className="muted">
        The app plays the other side. Find your moves all the way to the end of the line. Lines you get wrong come back
        sooner, and lines you know well come back less often.
      </p>

      {reps.length === 0 ? (
        <div className="empty">
          <p>No openings to practise yet.</p>
          <a href="#/openings">Add an opening first</a>
        </div>
      ) : (
        <>
          <section className="card">
            <h2>Openings</h2>
            <div className="choices wide">
              {reps.map((r) => {
                const lines = linesByRep.get(r.id) ?? []
                const dueHere = lines.filter((l) => isDue(stats.get(l.key), now)).length
                return (
                  <label key={r.id} className={`choice${selected.has(r.id) ? ' selected' : ''}`}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    <span className={`side-dot ${r.color}`} />
                    <span className="choice-name">{r.name}</span>
                    <span className="muted small choice-meta">
                      {lines.length} line{lines.length === 1 ? '' : 's'}
                      {dueHere ? ` · ${dueHere} due` : ''}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
          <button className="btn primary big" onClick={() => start()} disabled={!pool.length}>
            <Icon name="play" />
            {pool.length === 0 ? 'Pick an opening with lines' : due ? `Practise · ${due} line${due === 1 ? '' : 's'} due` : 'Play a random line'}
          </button>
          {tally.lines > 0 && (
            <p className="muted small">
              This session: {tally.lines} line{tally.lines === 1 ? '' : 's'}, {tally.perfect} perfect.
            </p>
          )}
        </>
      )}
    </div>
  )
}

interface BoardProps {
  session: Session
  setSession: Dispatch<SetStateAction<Session | null>>
  lines: Line[]
  tally: { lines: number; perfect: number }
  onFinished(clean: boolean): void
  onNext(): void
  onStop(): void
}

function PracticeBoard({ session, setSession, lines, tally, onFinished, onNext, onStop }: BoardProps) {
  const { rep, line, ply, status } = session
  const nodes = useMemo(() => nodesAlong(rep.root, line.path.slice(0, ply)), [rep, line, ply])
  const node = nodes[nodes.length - 1]
  const fen = node.fen
  const finished = ply >= line.path.length
  const yourTurn = !finished && isMoveBy(ply + 1, rep.color)
  const expected = line.path[ply]
  const opening = useOpening(nodes)
  const info = useMemo(() => positionInfo(fen), [fen])
  const dests = useMemo(() => (yourTurn ? legalDests(fen) : NO_DESTS), [fen, yourTurn])
  const lastMove = useMemo(() => (node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] as Key[] : undefined), [node.uci])
  const shapes = useMemo<DrawShape[]>(
    () =>
      session.hint && expected
        ? [{ orig: expected.slice(0, 2) as Key, dest: expected.slice(2, 4) as Key, brush: 'green' }]
        : [],
    [session.hint, expected],
  )

  // The app plays the other side's moves after a short pause.
  useEffect(() => {
    if (finished || yourTurn) return
    const timer = setTimeout(() => setSession((s) => s && { ...s, ply: s.ply + 1, status: 'playing' }), OPPONENT_DELAY)
    return () => clearTimeout(timer)
  }, [finished, yourTurn, ply, setSession])

  // Record the result once, when the last move of the line has been played.
  useEffect(() => {
    if (!finished || status === 'done') return
    setSession((s) => s && { ...s, status: 'done' })
    onFinished(session.mistakes === 0)
  }, [finished, status, session.mistakes, setSession, onFinished])

  const onMove = (from: Key, to: Key) => {
    const move = playMove(fen, from, to)
    if (!move) return
    if (move.uci === expected) {
      setSession((s) => s && { ...s, ply: s.ply + 1, status: 'playing', hint: false })
      return
    }
    // Another move you've also prepared here is fine: carry on down one of its lines.
    const prefix = [...line.path.slice(0, ply), move.uci]
    const options = lines.filter((l) => prefix.every((uci, i) => l.path[i] === uci))
    if (options.length) {
      const other = options[Math.floor(Math.random() * options.length)]
      setSession((s) => s && { ...s, line: other, ply: s.ply + 1, status: 'playing', hint: false })
      return
    }
    setSession((s) => s && { ...s, mistakes: s.mistakes + 1, status: 'wrong', resetKey: s.resetKey + 1 })
  }

  const showHint = () => setSession((s) => s && { ...s, hint: true, mistakes: s.hint ? s.mistakes : s.mistakes + 1 })

  const yourTotal = line.yourMoves
  const yourDone = line.path.slice(0, ply).filter((_, i) => isMoveBy(i + 1, rep.color)).length
  // Notes on the last two moves, so your note stays visible after the app replies.
  const notes = nodes
    .slice(-2)
    .map((n, i, recent) => ({ node: n, ply: ply - recent.length + 1 + i }))
    .filter((x) => x.ply > 0 && x.node.comment)
  const clean = session.mistakes === 0

  let message: string
  if (finished) message = clean ? 'Perfect! You know this line.' : `Line done, with ${session.mistakes} slip${session.mistakes === 1 ? '' : 's'}. It'll come back soon.`
  else if (status === 'wrong') message = "That's not your move here. Try again."
  else if (yourTurn) message = ply === 0 ? 'Your move. Start the line.' : 'Your move.'
  else message = `${turnOf(fen) === 'white' ? 'White' : 'Black'} is moving…`

  return (
    <div className="workspace">
      <div className="board-col">
        <div className="board-row">
          <Board
            fen={fen}
            orientation={rep.color}
            turn={turnOf(fen)}
            check={info.check}
            dests={dests}
            lastMove={lastMove}
            shapes={shapes}
            onMove={onMove}
            movableColor={yourTurn ? rep.color : null}
            resetKey={session.resetKey}
          />
        </div>
        <div className="controls">
          <button className="icon-btn" onClick={onStop} aria-label="Stop practising" title="Stop">
            <Icon name="back" />
          </button>
          <button className="icon-btn" onClick={showHint} disabled={!yourTurn} aria-label="Hint" title="Hint (counts as a slip)">
            <Icon name="hint" />
          </button>
          <button className="icon-btn" onClick={onNext} aria-label="Skip to another line" title="Another line">
            <Icon name="next" />
          </button>
        </div>
      </div>

      <div className="panel-col">
        <div className="opening-name">
          <span className={`side-dot ${rep.color}`} /> {rep.name}
          {opening && <span className="muted"> · {opening.name}</span>}
        </div>
        <div className={`practice-status ${finished ? (clean ? 'good' : 'ok') : status}`}>
          {finished && clean && <Icon name="check" />}
          {message}
        </div>
        <div className="progress" aria-label={`${yourDone} of ${yourTotal} of your moves found`}>
          <div className="progress-bar" style={{ width: `${(yourDone / yourTotal) * 100}%` }} />
        </div>
        <p className="muted small">
          Your moves: {yourDone} of {yourTotal}
          {session.mistakes > 0 && ` · ${session.mistakes} slip${session.mistakes === 1 ? '' : 's'}`}
        </p>
        {notes.map(({ node: n, ply: p }) => (
          <div key={p} className="note-card">
            <span className="muted small">Your note on {moveLabel(n.san, p, true)}</span>
            <p>{n.comment}</p>
          </div>
        ))}
        {finished && (
          <div className="actions">
            <button className="btn primary" onClick={onNext}>
              <Icon name="play" /> Next line
            </button>
            <button
              className="btn"
              onClick={() => setSession((s) => s && { ...s, ply: 0, mistakes: 0, status: 'playing', hint: false })}
            >
              <Icon name="reset" /> Again
            </button>
            <button className="btn" onClick={() => navigate(`/openings/${rep.id}/${line.path.join(',')}`)}>
              <Icon name="book" /> Open line
            </button>
          </div>
        )}
        {tally.lines > 0 && (
          <p className="muted small">
            This session: {tally.lines} line{tally.lines === 1 ? '' : 's'}, {tally.perfect} perfect.
          </p>
        )}
      </div>
    </div>
  )
}
