import { useMemo, useRef, useState } from 'react'
import { parsePgn, startsNormally } from '../chess/pgn'
import type { Side } from '../chess/position'
import { countLines, countMoves, mergeTree, newRoot } from '../chess/tree'
import { toast } from '../lib/toast'
import { newRepertoire, saveRepertoire, type Repertoire } from '../storage/db'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { OpeningFields } from './OpeningFields'

interface Props {
  repertoires: Repertoire[]
  onClose(): void
  onImported(repertoire: Repertoire): void
}

/** Paste or open a PGN file and add all its games (with their branches) to one opening. */
export function ImportPgnDialog({ repertoires, onClose, onImported }: Props) {
  const [text, setText] = useState('')
  const [choice, setChoice] = useState('new')
  // null until the name is edited, so it can follow the PGN's event name.
  const [name, setName] = useState<string | null>(null)
  const [color, setColor] = useState<Side | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => {
    const games = text.trim() ? parsePgn(text) : []
    const usable = games.filter((g) => startsNormally(g) && g.root.children.length)
    const root = usable.reduce((acc, g) => mergeTree(acc, g.root).root, newRoot())
    const problems = games.flatMap((g) => g.problems)
    const skipped = games.length - usable.length
    const first = usable[0]?.headers
    const event = first?.Event && first.Event !== '?' ? first.Event : ''
    const side: Side = first?.Orientation === 'black' ? 'black' : 'white'
    return { games: usable.length, root, problems, skipped, event, side }
  }, [text])

  const moves = countMoves(parsed.root)
  const shownName = name ?? (parsed.event || 'Imported opening')
  const finalName = shownName.trim() || 'Imported opening'
  const finalColor = color ?? parsed.side

  const importNow = async () => {
    if (!moves) return
    let target: Repertoire
    let added = moves
    if (choice === 'new') {
      target = { ...newRepertoire(finalName, finalColor), root: parsed.root }
    } else {
      const existing = repertoires.find((r) => r.id === choice)
      if (!existing) return
      const merged = mergeTree(existing.root, parsed.root)
      target = { ...existing, root: merged.root, updatedAt: Date.now() }
      added = merged.added
    }
    await saveRepertoire(target)
    toast(added ? `Imported ${added} move${added === 1 ? '' : 's'} into ${target.name}` : `Nothing new for ${target.name}`)
    onImported(target)
  }

  return (
    <Modal title="Import PGN" onClose={onClose}>
      <p className="muted small">
        Paste PGN from Lichess, En Croissant or a book, or open a .pgn file. Every game and branch goes into one opening.
      </p>
      <textarea
        className="pgn-input"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'[Event "My Caro-Kann"]\n\n1. e4 c6 2. d4 d5 (2... g6) 3. e5 Bf5 *'}
        spellCheck={false}
      />
      <div className="row">
        <button className="btn" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" /> Open .pgn file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".pgn,.txt,text/plain,application/x-chess-pgn"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) setText(await file.text())
            e.target.value = ''
          }}
        />
      </div>

      {text.trim() && (
        <div className={`import-summary${moves ? '' : ' bad'}`}>
          {moves ? (
            <>
              Found {parsed.games} game{parsed.games === 1 ? '' : 's'}: {countLines(parsed.root)} line
              {countLines(parsed.root) === 1 ? '' : 's'}, {moves} move{moves === 1 ? '' : 's'}.
            </>
          ) : (
            "Couldn't find any moves in that text."
          )}
          {parsed.skipped > 0 && <div>{parsed.skipped} game(s) skipped: they don't start from the normal position.</div>}
          {parsed.problems.slice(0, 3).map((p) => (
            <div key={p}>{p}, so that branch was skipped.</div>
          ))}
          {parsed.problems.length > 3 && <div>…and {parsed.problems.length - 3} more problems.</div>}
        </div>
      )}

      {moves > 0 && (
        <>
          <div className="choices" role="radiogroup" aria-label="Import into">
            <label className={`choice${choice === 'new' ? ' selected' : ''}`}>
              <input type="radio" name="import-target" checked={choice === 'new'} onChange={() => setChoice('new')} />
              <span className="choice-name">New opening</span>
            </label>
            {repertoires.map((r) => (
              <label key={r.id} className={`choice${choice === r.id ? ' selected' : ''}`}>
                <input type="radio" name="import-target" checked={choice === r.id} onChange={() => setChoice(r.id)} />
                <span className={`side-dot ${r.color}`} />
                <span className="choice-name">Add to {r.name}</span>
              </label>
            ))}
          </div>
          {choice === 'new' && <OpeningFields name={shownName} color={finalColor} onName={setName} onColor={setColor} />}
        </>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={importNow} disabled={!moves}>
          Import
        </button>
      </div>
    </Modal>
  )
}
