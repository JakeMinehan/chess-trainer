import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { OpeningFields } from '../components/OpeningFields'
import type { Side } from '../chess/position'
import { countLines, countMoves } from '../chess/tree'
import { navigate } from '../lib/router'
import { LAST_BACKUP_KEY } from '../storage/backup'
import { getMeta, listRepertoires, newRepertoire, saveRepertoire, type Repertoire } from '../storage/db'

const WEEK = 7 * 24 * 60 * 60 * 1000

export function OpeningsPage() {
  const [list, setList] = useState<Repertoire[] | null>(null)
  const [lastBackup, setLastBackup] = useState<number | undefined>()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<Side>('white')

  useEffect(() => {
    listRepertoires().then(setList)
    getMeta<number>(LAST_BACKUP_KEY).then(setLastBackup)
  }, [])

  if (!list) return null
  const needsBackup = list.length > 0 && (!lastBackup || Date.now() - lastBackup > WEEK)

  const create = async () => {
    const r = newRepertoire(name.trim() || 'My opening', color)
    await saveRepertoire(r)
    navigate(`/openings/${r.id}`)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>My openings</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> New
        </button>
      </header>

      {needsBackup && (
        <a className="banner" href="#/settings">
          Your openings are only saved on this device. Back them up so you can't lose them.
        </a>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <p>No openings yet.</p>
          <p className="muted">
            Play some moves on the <a href="#/analyze">Analyze</a> board and tap <strong>Save line</strong>, or tap{' '}
            <strong>New</strong> to start an opening here.
          </p>
        </div>
      ) : (
        <ul className="rep-list">
          {list.map((r) => {
            const lines = countLines(r.root)
            const moves = countMoves(r.root)
            return (
              <li key={r.id}>
                <a className="rep-card" href={`#/openings/${r.id}`}>
                  <span className={`side-dot ${r.color}`} />
                  <span className="rep-text">
                    <span className="rep-name">{r.name}</span>
                    <span className="muted">
                      {r.color === 'white' ? 'White' : 'Black'} · {lines} line{lines === 1 ? '' : 's'} · {moves} move
                      {moves === 1 ? '' : 's'}
                    </span>
                  </span>
                  <Icon name="next" />
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {creating && (
        <Modal title="New opening" onClose={() => setCreating(false)}>
          <OpeningFields name={name} color={color} onName={setName} onColor={setColor} autoFocus />
          <div className="modal-actions">
            <button className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={create}>
              Create
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
