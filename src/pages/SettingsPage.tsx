import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { isInstalled, useInstallPrompt } from '../lib/install'
import { BOARD_THEMES, PIECE_SETS, SOUND_SETS, setPref, usePrefs } from '../lib/prefs'
import { preview } from '../lib/sound'
import { toast } from '../lib/toast'
import { checkForUpdate, reloadToUpdate, useUpdateReady } from '../lib/update'
import { backUpNow, describeRestore, LAST_BACKUP_KEY, parseBackup, repertoirePgn, restoreBackup, saveFile } from '../storage/backup'
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

/** Move sounds: pick a set and hear a preview straight away. */
function SoundChoice() {
  const prefs = usePrefs()
  return (
    <section className="card">
      <h2>Sound</h2>
      <div className="segmented sound-picker" role="radiogroup" aria-label="Move sounds">
        {SOUND_SETS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={prefs.sound === s.id}
            className={prefs.sound === s.id ? 'selected' : ''}
            onClick={() => {
              setPref('sound', s.id)
              if (s.id !== 'off') preview()
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted small">
        Tap a set to hear it. Wood is made by this app; SFX and Piano are free Lichess sets by Enigmahack. No sound on an
        iPhone? Check the silent switch.
      </p>
    </section>
  )
}

/** Which version is running, and a manual check for a newer one. */
function AppVersion() {
  const ready = useUpdateReady()
  const [checking, setChecking] = useState(false)
  const built = new Date(__BUILD_TIME__).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const check = async () => {
    setChecking(true)
    try {
      const coming = await checkForUpdate()
      if (!coming) toast(navigator.onLine ? 'You have the latest version' : "You're offline, so the app can't check for updates")
    } catch {
      toast("Couldn't check for updates")
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="card">
      <h2>App version</h2>
      <p>
        Built {built}.{' '}
        <span className="muted">New versions download in the background and wait for you to reload.</span>
      </p>
      {ready ? (
        <button className="btn primary" onClick={reloadToUpdate}>
          <Icon name="refresh" /> Reload to update
        </button>
      ) : (
        <button className="btn" onClick={check} disabled={checking}>
          <Icon name="refresh" /> {checking ? 'Checking…' : 'Check for updates'}
        </button>
      )}
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
      toast(describeRestore(await restoreBackup(backup)))
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
      <SoundChoice />

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
          Saves one file with your openings, practice history, puzzle rating and settings. Keep it in Google Drive or Files.{' '}
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
        <p>
          Adds everything from a backup file that isn't already here, and keeps the newer history for each line and
          puzzle. Nothing on this device is deleted. Your settings are set to the backup's.
        </p>
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

      <AppVersion />
    </div>
  )
}
