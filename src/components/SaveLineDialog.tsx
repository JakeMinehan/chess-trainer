import { useState } from 'react'
import type { Side } from '../chess/position'
import { mergeLine, moveLabel, nodeAt, type MoveData } from '../chess/tree'
import { toast } from '../lib/toast'
import { newRepertoire, saveRepertoire, type Repertoire } from '../storage/db'
import { Modal } from './Modal'
import { OpeningFields } from './OpeningFields'

interface Props {
  line: MoveData[]
  repertoires: Repertoire[]
  /** The side the board is facing, used as the default for a new opening. */
  side: Side
  suggestedName: string
  onClose(): void
  onSaved(repertoire: Repertoire): void
}

/** How many moves of the line are already in the repertoire. */
function sharedMoves(r: Repertoire, line: MoveData[]): number {
  let n = 0
  while (n < line.length && nodeAt(r.root, line.slice(0, n + 1).map((m) => m.uci))) n++
  return n
}

function bestMatch(repertoires: Repertoire[], line: MoveData[], side: Side): string {
  let best: Repertoire | undefined
  let bestShared = 0
  for (const r of repertoires) {
    const shared = sharedMoves(r, line)
    if (shared > bestShared) {
      best = r
      bestShared = shared
    }
  }
  return (best ?? repertoires.find((r) => r.color === side))?.id ?? 'new'
}

export function SaveLineDialog({ line, repertoires, side, suggestedName, onClose, onSaved }: Props) {
  const [choice, setChoice] = useState(() => bestMatch(repertoires, line, side))
  const [name, setName] = useState(suggestedName)
  const [color, setColor] = useState<Side>(side)
  const [busy, setBusy] = useState(false)

  const preview = line.map((m, i) => moveLabel(m.san, i + 1, i === 0)).join(' ')

  const save = async () => {
    const target =
      choice === 'new' ? newRepertoire(name.trim() || suggestedName, color) : repertoires.find((r) => r.id === choice)
    if (!target) return
    setBusy(true)
    const { root, added } = mergeLine(target.root, line)
    const updated = { ...target, root, updatedAt: Date.now() }
    await saveRepertoire(updated)
    toast(added ? `Saved ${added} new move${added === 1 ? '' : 's'} to ${updated.name}` : `Already in ${updated.name}`)
    onSaved(updated)
  }

  return (
    <Modal title="Save line" onClose={onClose}>
      <p className="line-preview">{preview}</p>
      <div className="choices" role="radiogroup" aria-label="Save to">
        {repertoires.map((r) => (
          <label key={r.id} className={`choice${choice === r.id ? ' selected' : ''}`}>
            <input type="radio" name="target" checked={choice === r.id} onChange={() => setChoice(r.id)} />
            <span className={`side-dot ${r.color}`} />
            <span className="choice-name">{r.name}</span>
          </label>
        ))}
        <label className={`choice${choice === 'new' ? ' selected' : ''}`}>
          <input type="radio" name="target" checked={choice === 'new'} onChange={() => setChoice('new')} />
          <span className="choice-name">New opening…</span>
        </label>
      </div>
      {choice === 'new' && <OpeningFields name={name} color={color} onName={setName} onColor={setColor} />}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          Save
        </button>
      </div>
    </Modal>
  )
}
