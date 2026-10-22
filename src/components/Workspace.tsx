import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DrawShape } from 'chessground/draw'
import type { Key } from 'chessground/types'
import { useOpening } from '../chess/openings'
import { legalDests, playMove, playUci, positionInfo, turnOf, type Side } from '../chess/position'
import {
  addMove,
  countMoves,
  deleteAt,
  mainlineFrom,
  moveLabel,
  nodeAt,
  nodesAlong,
  promote,
  setComment,
  type MoveData,
  type MoveNode,
  type Path,
} from '../chess/tree'
import type { Mark } from '../chess/review'
import { useEngine } from '../chess/useEngine'
import { toast } from '../lib/toast'
import { Board } from './Board'
import { EngineLines } from './EngineLines'
import { EvalBar } from './EvalBar'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { MoveList } from './MoveList'

interface Props {
  root: MoveNode
  path: Path
  orientation: Side
  /** Called for every change: a new move, an edit, or just moving to another position. */
  onChange(root: MoveNode, path: Path): void
  onFlip(): void
  /** Buttons shown above the move list. */
  actions?: ReactNode
  /** Shown under the opening name. */
  notice?: ReactNode
  /** Review marks for the move list. */
  marks?: Map<string, Mark>
  /** Turns the live engine off, e.g. while a game review is using the processor. */
  engineDisabled?: boolean
}

function readEnginePref(): boolean {
  try {
    return localStorage.getItem('engine') !== 'off'
  } catch {
    return true
  }
}

/** The board, engine, move list and controls, shared by Analyze and the opening editor. */
export function Workspace({ root, path, orientation, onChange, onFlip, actions, notice, marks, engineDisabled }: Props) {
  const nodes = useMemo(() => nodesAlong(root, path), [root, path])
  const node = nodes[nodes.length - 1]
  const parent = nodes.length > 1 ? nodes[nodes.length - 2] : undefined
  const fen = node.fen
  const turn = turnOf(fen)
  const info = useMemo(() => positionInfo(fen), [fen])
  const dests = useMemo(() => (info.result ? new Map<Key, Key[]>() : legalDests(fen)), [fen, info.result])
  const lastMove = useMemo(() => (node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] as Key[] : undefined), [node.uci])

  const [enginePref, setEngineOn] = useState(readEnginePref)
  const engineOn = enginePref && !engineDisabled
  const analysis = useEngine(engineOn && !info.result ? fen : null)
  const best = engineOn ? analysis?.lines[0] : undefined
  const bestMove = best?.pv[0]
  const shapes = useMemo<DrawShape[]>(
    () => (bestMove ? [{ orig: bestMove.slice(0, 2) as Key, dest: bestMove.slice(2, 4) as Key, brush: 'paleBlue' }] : []),
    [bestMove],
  )
  const opening = useOpening(nodes)

  const toggleEngine = () => {
    setEngineOn((on) => {
      try {
        localStorage.setItem('engine', on ? 'off' : 'on')
      } catch {
        // Not saved; the setting just won't be remembered.
      }
      return !on
    })
  }

  const play = (move: MoveData | null) => {
    if (move) onChange(addMove(root, path, move), [...path, move.uci])
  }
  const go = (p: Path) => onChange(root, p)
  const back = () => path.length && go(path.slice(0, -1))
  const forward = () => node.children[0] && go([...path, node.children[0].uci])
  const toStart = () => go([])
  const toEnd = () => go(mainlineFrom(root, path))

  /** Trims the tree at `target`: that move and everything after it go, and Undo brings them back. */
  const deleteFrom = (target: Path) => {
    const doomed = nodeAt(root, target)
    if (!doomed || !target.length) return
    const after = countMoves(doomed)
    // If we are looking at that move or a later one, step back to just before it.
    const onThisLine = target.length <= path.length && target.every((uci, i) => path[i] === uci)
    const before = { root, path }
    onChange(deleteAt(root, target), onThisLine ? target.slice(0, -1) : path)
    const label = moveLabel(doomed.san, target.length, true)
    toast(after ? `Deleted ${label} and ${after} move${after === 1 ? '' : 's'} after it` : `Deleted ${label}`, {
      label: 'Undo',
      run: () => onChange(before.root, before.path),
    })
  }
  const canPromote = !!parent && parent.children[0] !== node

  // Options for a move in the list (press and hold, or right-click).
  const [menuPath, setMenuPath] = useState<Path | null>(null)
  const menuNodes = menuPath ? nodesAlong(root, menuPath) : []
  const menuNode = menuPath && menuNodes.length === menuPath.length + 1 ? menuNodes[menuNodes.length - 1] : undefined
  const menuParent = menuNodes[menuNodes.length - 2]
  const menuAfter = menuNode ? countMoves(menuNode) : 0

  // Arrow keys step through moves on a computer keyboard.
  const keys = useRef({ back, forward, toStart, toEnd, onFlip })
  keys.current = { back, forward, toStart, toEnd, onFlip }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = keys.current
      const actions: Record<string, () => unknown> = {
        ArrowLeft: k.back,
        ArrowRight: k.forward,
        ArrowUp: k.toStart,
        ArrowDown: k.toEnd,
        f: k.onFlip,
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // Notes on the current move are saved when the box loses focus.
  const [note, setNote] = useState(node.comment ?? '')
  useEffect(() => setNote(node.comment ?? ''), [node])
  const saveNote = () => {
    if (note.trim() !== (node.comment ?? '')) onChange(setComment(root, path, note), path)
  }

  return (
    <div className="workspace">
      <div className="board-col">
        <div className="board-row">
          {engineOn && <EvalBar line={best} orientation={orientation} />}
          <Board
            fen={fen}
            orientation={orientation}
            turn={turn}
            check={info.check}
            dests={dests}
            lastMove={lastMove}
            shapes={shapes}
            onMove={(from, to) => play(playMove(fen, from, to))}
          />
        </div>
        <div className="controls">
          <button className="icon-btn" onClick={toStart} disabled={!path.length} aria-label="Go to start">
            <Icon name="first" />
          </button>
          <button className="icon-btn" onClick={back} disabled={!path.length} aria-label="Back one move">
            <Icon name="prev" />
          </button>
          <button className="icon-btn" onClick={forward} disabled={!node.children.length} aria-label="Forward one move">
            <Icon name="next" />
          </button>
          <button className="icon-btn" onClick={toEnd} disabled={!node.children.length} aria-label="Go to end of line">
            <Icon name="last" />
          </button>
          <button className="icon-btn" onClick={onFlip} aria-label="Flip board">
            <Icon name="flip" />
          </button>
          {canPromote && (
            <button className="icon-btn" onClick={() => onChange(promote(root, path), path)} aria-label="Make main line">
              <Icon name="promote" />
            </button>
          )}
          <button
            className="icon-btn danger"
            onClick={() => deleteFrom(path)}
            disabled={!path.length}
            aria-label="Delete from this move"
            title="Delete this move and everything after it"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="panel-col">
        <div className="opening-name">
          {opening ? (
            <>
              <span className="eco">{opening.eco}</span> {opening.name}
            </>
          ) : (
            <span className="muted">{path.length ? 'No opening name for this position' : 'Starting position'}</span>
          )}
        </div>
        {notice}
        {info.result && <div className="result">{info.result}</div>}
        <EngineLines
          enabled={engineOn}
          onToggle={toggleEngine}
          analysis={analysis}
          fen={fen}
          onPlay={(uci) => play(playUci(fen, uci))}
        />
        {actions && <div className="actions">{actions}</div>}
        <MoveList root={root} path={path} onSelect={go} onMenu={setMenuPath} marks={marks} />
        {path.length > 0 && (
          <label className="note">
            <span className="muted">Note on {moveLabel(node.san, path.length, true)}</span>
            <textarea
              value={note}
              rows={2}
              placeholder="Why this move? Plans, traps, ideas…"
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
            />
          </label>
        )}
      </div>

      {menuPath && menuNode && (
        <Modal title={moveLabel(menuNode.san, menuPath.length, true)} onClose={() => setMenuPath(null)}>
          <div className="menu">
            {menuParent && menuParent.children[0] !== menuNode && (
              <button
                className="btn"
                onClick={() => {
                  onChange(promote(root, menuPath), path)
                  setMenuPath(null)
                }}
              >
                <Icon name="promote" /> Make main line
              </button>
            )}
            <button
              className="btn danger"
              onClick={() => {
                setMenuPath(null)
                deleteFrom(menuPath)
              }}
            >
              <Icon name="trash" />
              {menuAfter ? `Delete this move and the ${menuAfter} after it` : 'Delete this move'}
            </button>
            <button className="btn" onClick={() => setMenuPath(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
