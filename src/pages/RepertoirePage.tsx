import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { OpeningFields } from '../components/OpeningFields'
import { Workspace } from '../components/Workspace'
import type { Side } from '../chess/position'
import { countLines, countMoves, type Path } from '../chess/tree'
import { navigate } from '../lib/router'
import { toast } from '../lib/toast'
import { fileSafe, repertoirePgn, saveFile } from '../storage/backup'
import { deleteRepertoire, getRepertoire, saveRepertoire, type Repertoire } from '../storage/db'

/** Browse and edit one opening. Every change is saved straight away. */
export function RepertoirePage({ id }: { id: string }) {
  const [rep, setRep] = useState<Repertoire | null | undefined>(undefined)
  const [path, setPath] = useState<Path>([])
  const [orientation, setOrientation] = useState<Side>('white')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<Side>('white')
  // Undo runs after later renders, so edits read the latest opening from here.
  const latest = useRef(rep)
  latest.current = rep

  useEffect(() => {
    getRepertoire(id).then((r) => {
      setRep(r ?? null)
      if (r) setOrientation(r.color)
    })
  }, [id])

  if (rep === undefined) return null
  if (rep === null) {
    return (
      <div className="page empty">
        <p>This opening doesn't exist any more.</p>
        <a href="#/openings">Back to my openings</a>
      </div>
    )
  }

  const update = (next: Repertoire) => {
    setRep(next)
    saveRepertoire(next)
  }

  const openEdit = () => {
    setName(rep.name)
    setColor(rep.color)
    setEditing(true)
  }

  const saveEdit = () => {
    update({ ...rep, name: name.trim() || rep.name, color, updatedAt: Date.now() })
    setOrientation(color)
    setEditing(false)
  }

  // Deletes straight away; Undo puts the opening back and reopens it.
  const remove = async () => {
    const removed = rep
    await deleteRepertoire(removed.id)
    navigate('/openings')
    toast(`Deleted ${removed.name}`, {
      label: 'Undo',
      run: async () => {
        await saveRepertoire(removed)
        navigate(`/openings/${removed.id}`)
      },
    })
  }

  const exportPgn = async () => {
    const result = await saveFile(`${fileSafe(rep.name)}.pgn`, repertoirePgn(rep), 'application/x-chess-pgn')
    if (result === 'downloaded') toast('PGN downloaded')
  }

  const lines = countLines(rep.root)
  const moves = countMoves(rep.root)

  return (
    <>
      <header className="page-head rep-head">
        <a className="icon-btn" href="#/openings" aria-label="Back to my openings">
          <Icon name="back" />
        </a>
        <div className="rep-title">
          <h1>{rep.name}</h1>
          <span className="muted">
            <span className={`side-dot ${rep.color}`} /> {rep.color === 'white' ? 'White' : 'Black'} · {lines} line
            {lines === 1 ? '' : 's'} · {moves} move{moves === 1 ? '' : 's'}
          </span>
        </div>
        <button className="icon-btn" onClick={exportPgn} aria-label="Export as PGN">
          <Icon name="share" />
        </button>
        <button className="icon-btn" onClick={openEdit} aria-label="Edit opening">
          <Icon name="edit" />
        </button>
      </header>

      <Workspace
        root={rep.root}
        path={path}
        orientation={orientation}
        onChange={(root, nextPath) => {
          const current = latest.current
          if (current && root !== current.root) update({ ...current, root, updatedAt: Date.now() })
          setPath(nextPath)
        }}
        onFlip={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
        notice={
          moves === 0 && (
            <div className="notice">Play the moves of this opening on the board. Every move is saved as you go.</div>
          )
        }
      />

      {editing && (
        <Modal title="Edit opening" onClose={() => setEditing(false)}>
          <OpeningFields name={name} color={color} onName={setName} onColor={setColor} />
          <div className="modal-actions">
            <button className="btn danger" onClick={remove}>
              <Icon name="trash" /> Delete opening
            </button>
            <span className="spacer" />
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveEdit}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
