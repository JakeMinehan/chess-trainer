import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { buildPrepIndex, checkPrep, describePrep } from '../chess/prep'
import { CHESSCOM_KEY, importLatest, importOlder, type ChessComSettings } from '../lib/chesscom'
import { toast } from '../lib/toast'
import { getMeta, listGames, listRepertoires, type Repertoire, type StoredGame } from '../storage/db'

const PAGE = 30

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Your chess.com games, each checked against your openings. */
export function GamesPage() {
  const [settings, setSettings] = useState<ChessComSettings | null | undefined>(undefined)
  const [games, setGames] = useState<StoredGame[]>([])
  const [reps, setReps] = useState<Repertoire[]>([])
  const [username, setUsername] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    getMeta<ChessComSettings>(CHESSCOM_KEY).then((s) => {
      setSettings(s ?? null)
      setUsername(s?.username ?? '')
    })
    listGames().then(setGames)
    listRepertoires().then(setReps)
  }, [])

  const index = useMemo(
    () => ({
      white: buildPrepIndex(reps.filter((r) => r.color === 'white')),
      black: buildPrepIndex(reps.filter((r) => r.color === 'black')),
    }),
    [reps],
  )

  const run = async (message: string, task: () => Promise<void>) => {
    setBusy(message)
    try {
      await task()
      setGames(await listGames())
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const connect = () => {
    const name = username.trim()
    if (!name) return
    run('Importing your recent games…', async () => {
      const { added, settings: next } = await importLatest(name)
      setSettings(next)
      setEditing(false)
      toast(added ? `Imported ${added} game${added === 1 ? '' : 's'}` : 'No new games')
    })
  }

  const loadOlder = () =>
    settings &&
    run('Importing older games…', async () => {
      const result = await importOlder(settings)
      if (!result) return toast('No older games on chess.com')
      setSettings(result.settings)
      toast(`${result.added} game${result.added === 1 ? '' : 's'} from ${result.month}`)
    })

  if (settings === undefined) return null
  const mine = settings ? games.filter((g) => [g.white.name, g.black.name].some((n) => n.toLowerCase() === settings.username.toLowerCase())) : []

  if (!settings || editing) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Games</h1>
        </header>
        <section className="card">
          <h2>Import your chess.com games</h2>
          <p>
            Enter your chess.com username. The app reads your public games (no password needed) and checks each one against
            your openings.
          </p>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="chess.com username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => e.key === 'Enter' && connect()}
          />
          <div className="row">
            <button className="btn primary" onClick={connect} disabled={!username.trim() || !!busy}>
              <Icon name="download" /> {busy ?? 'Import games'}
            </button>
            {editing && (
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Games</h1>
          <span className="muted small">
            chess.com · {settings.username} ·{' '}
            <button className="link" onClick={() => setEditing(true)}>
              change
            </button>
          </span>
        </div>
        <button className="btn" onClick={() => run('Checking for new games…', async () => {
          const { added } = await importLatest(settings.username)
          toast(added ? `${added} new game${added === 1 ? '' : 's'}` : 'No new games')
        })} disabled={!!busy}>
          <Icon name="refresh" /> {busy ? 'Working…' : 'Refresh'}
        </button>
      </header>

      {busy && <p className="muted small">{busy}</p>}

      {mine.length === 0 ? (
        <div className="empty">
          <p>No games found yet.</p>
          <p className="muted">Play a game on chess.com, then tap Refresh, or load older games below.</p>
        </div>
      ) : (
        <ul className="game-list">
          {mine.slice(0, shown).map((g) => {
            const opponent = g.myColor === 'white' ? g.black : g.white
            const prep = checkPrep(g.moves, g.myColor, index[g.myColor])
            return (
              <li key={g.id}>
                <a className="game-row" href={`#/games/${g.id}`}>
                  <span className={`result-badge ${g.result}`}>{g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : 'D'}</span>
                  <span className="game-text">
                    <span className="game-title">
                      <span className={`side-dot ${g.myColor}`} /> vs {opponent.name}{' '}
                      <span className="muted">({opponent.rating})</span>
                    </span>
                    <span className="muted small">
                      {g.opening?.name ?? 'Unknown opening'} · {g.timeClass} · {formatDate(g.endTime)}
                    </span>
                    <span className={`prep-line ${prep.kind}`}>{describePrep(prep, g.moves, g.myColor)}</span>
                  </span>
                  <Icon name="next" />
                </a>
              </li>
            )
          })}
        </ul>
      )}

      <div className="row">
        {mine.length > shown && (
          <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Show more
          </button>
        )}
        <button className="btn" onClick={loadOlder} disabled={!!busy}>
          <Icon name="history" /> Load older games
        </button>
      </div>
    </div>
  )
}
