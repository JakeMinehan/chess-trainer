import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { isInstalled, useInstallPrompt } from '../lib/install'
import { BOARD_THEMES, PIECE_SETS, setPref, usePrefs } from '../lib/prefs'
import { toast } from '../lib/toast'
import { backUpNow, LAST_BACKUP_KEY, parseBackup, repertoirePgn, restoreBackup, saveFile } from '../storage/backup'
import { getMeta, listRepertoires, requestPersistence } from '../storage/db'

function timeAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** Board colours and piece sets, each shown as a small preview. */
function BoardLook() {
  const prefs = usePrefs()
  const theme = BOARD_THEMES.find((t) => t.id === prefs.board) ?? BOARD_THEMES[0]
  const piece = (set: string, name: string) => `${import.meta.env.BASE_URL}pieces/${set}/${name}.svg`

  return (
    <section className="card">
      <h2>Board</h2>
      <div className="picker" role="radiogroup" aria-label="Board colour">
        {BOARD_THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={prefs.board === t.id}
            className={`swatch${prefs.board === t.id ? ' selected' : ''}`}
            onClick={() => setPref('board', t.id)}
          >
            <span
              className="swatch-board"
              style={{ background: `repeating-conic-gradient(${t.dark} 0 25%, ${t.light} 0 50%) 0 0 / 50% 50%` }}
            />
            {t.label}
          </button>
        ))}
      </div>
      <h2>Pieces</h2>
      <div className="picker pieces" role="radiogroup" aria-label="Piece set">
        {PIECE_SETS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={prefs.pieces === p.id}
            className={`swatch${prefs.pieces === p.id ? ' selected' : ''}`}
            onClick={() => setPref('pieces', p.id)}
          >
            <span className="piece-preview">
              <img src={piece(p.id, 'wN')} alt="" style={{ background: theme.light }} />
              <img src={piece(p.id, 'bQ')} alt="" style={{ background: theme.dark }} />
            </span>
            {p.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function SettingsPage() {
  const install = useInstallPrompt()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<number | null>(null)
  const [lastBackup, setLastBackup] = useState<number | undefined>()
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () => {
    navigator.storage?.persisted?.().then(setPersisted)
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null))
    getMeta<number>(LAST_BACKUP_KEY).then(setLastBackup)
  }
  useEffect(refresh, [])

  const protect = async () => {
    const ok = await requestPersistence()
    setPersisted(ok)
    toast(ok ? 'Your data is protected' : "The browser didn't allow it yet. Installing the app usually fixes this.")
  }

  const backUp = async () => {
    const result = await backUpNow()
    if (result === 'downloaded') toast('Backup file downloaded')
    refresh()
  }

  const exportPgn = async () => {
    const all = await listRepertoires()
    if (!all.length) return toast('No openings to export yet')
    await saveFile('my-openings.pgn', all.map(repertoirePgn).join('\n'), 'application/x-chess-pgn')
  }

  const restore = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      const { openings, moves } = await restoreBackup(backup)
      toast(openings || moves ? `Restored ${openings} opening(s) and ${moves} extra move(s)` : 'Nothing new in that backup')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <BoardLook />

      <section className="card">
        <h2>Install on your phone</h2>
        {isInstalled() ? (
          <p>
            Installed. Always open it from the home screen icon, because that copy keeps its own saved openings.
          </p>
        ) : (
          <>
            <p>Installing gives you an app icon, works offline, and stops the browser clearing your openings.</p>
            {install && (
              <button className="btn primary" onClick={install}>
                Install app
              </button>
            )}
            <ul className="steps">
              <li>
                <strong>iPhone:</strong> open this page in Safari, tap Share, then <em>Add to Home Screen</em>.
              </li>
              <li>
                <strong>Android:</strong> open this page in Chrome, tap ⋮, then <em>Install app</em>.
              </li>
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2>Storage</h2>
        <p>
          Your openings are saved on this device only. Nothing is uploaded.
          {usage !== null && <span className="muted"> Using {(usage / 1024 / 1024).toFixed(1)} MB.</span>}
        </p>
        {persisted ? (
          <p className="ok">Protected: the browser won't clear this data to free up space.</p>
        ) : (
          <button className="btn" onClick={protect}>
            Protect my data
          </button>
        )}
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p>
          Saves one file with all your openings. Keep it in Google Drive or Files.{' '}
          <span className="muted">Last backup: {lastBackup ? timeAgo(lastBackup) : 'never'}.</span>
        </p>
        <div className="row">
          <button className="btn primary" onClick={backUp}>
            <Icon name="share" /> Back up now
          </button>
          <button className="btn" onClick={exportPgn}>
            Export all as PGN
          </button>
        </div>
        <p className="muted small">PGN files open in Lichess, En Croissant and ChessBase.</p>
      </section>

      <section className="card">
        <h2>Restore</h2>
        <p>Adds everything from a backup file that isn't already here. Nothing on this device is deleted.</p>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" /> Restore from backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) restore(file)
            e.target.value = ''
          }}
        />
      </section>
    </div>
  )
}
