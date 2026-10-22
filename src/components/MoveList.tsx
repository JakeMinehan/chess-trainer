import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { moveLabel, type MoveNode, type Path } from '../chess/tree'

interface Props {
  root: MoveNode
  path: Path
  onSelect(path: Path): void
  /** Opens the options for a move (press and hold on a phone, right-click on a computer). */
  onMenu(path: Path): void
}

const HOLD_MS = 450

/**
 * The move tree as text: the main line, with other moves in brackets where
 * they branch off. Tap any move to jump to it.
 */
export function MoveList({ root, path, onSelect, onMenu }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const current = path.join(' ')
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; opened: boolean }>({
    x: 0,
    y: 0,
    opened: false,
  })

  // Keep the current move in view without scrolling the whole page.
  useEffect(() => {
    const container = box.current
    const active = container?.querySelector<HTMLElement>('.move.active')
    if (!container || !active) return
    const top = active.offsetTop - container.offsetTop
    if (top < container.scrollTop || top > container.scrollTop + container.clientHeight - active.offsetHeight) {
      container.scrollTop = top - container.clientHeight / 2
    }
  }, [current])

  const cancelHold = () => clearTimeout(hold.current.timer)

  const startHold = (nodePath: Path) => (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return
    cancelHold()
    hold.current = {
      x: e.clientX,
      y: e.clientY,
      opened: false,
      timer: setTimeout(() => {
        hold.current.opened = true
        onMenu(nodePath)
      }, HOLD_MS),
    }
  }

  const moveHold = (e: PointerEvent) => {
    // Scrolling the list is not a press-and-hold.
    if (Math.abs(e.clientX - hold.current.x) > 8 || Math.abs(e.clientY - hold.current.y) > 8) cancelHold()
  }

  const move = (node: MoveNode, nodePath: Path, ply: number, forceNumber: boolean) => {
    const key = nodePath.join(' ')
    return (
      <button
        key={key}
        className={`move${key === current ? ' active' : ''}`}
        onClick={() => {
          if (hold.current.opened) hold.current.opened = false
          else onSelect(nodePath)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          cancelHold()
          if (!hold.current.opened) onMenu(nodePath)
        }}
        onPointerDown={startHold(nodePath)}
        onPointerMove={moveHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
      >
        {moveLabel(node.san, ply, forceNumber)}
      </button>
    )
  }

  const line = (parent: MoveNode, parentPath: Path, ply: number, forceNumber: boolean, depth: number): ReactNode[] => {
    const out: ReactNode[] = []
    let node = parent
    let nodePath = parentPath
    let force = forceNumber
    while (node.children.length) {
      const [main, ...variations] = node.children
      const mainPath = [...nodePath, main.uci]
      out.push(move(main, mainPath, ply, force))
      force = false
      if (main.comment) {
        out.push(<span key={`${mainPath.join(' ')}#c`} className="comment">{main.comment}</span>)
        force = true
      }
      for (const v of variations) {
        const vPath = [...nodePath, v.uci]
        const vKey = vPath.join(' ')
        out.push(
          <span key={`${vKey}#v`} className={`variation${depth === 0 ? ' block' : ''}`}>
            {move(v, vPath, ply, true)}
            {v.comment && <span className="comment">{v.comment}</span>}
            {line(v, vPath, ply + 1, !!v.comment, depth + 1)}
          </span>,
        )
        force = true
      }
      node = main
      nodePath = mainPath
      ply++
    }
    return out
  }

  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

  return (
    <div className="moves" ref={box}>
      {root.children.length ? (
        <>
          <div className="move-text">{line(root, [], 1, true, 0)}</div>
          <p className="moves-hint">{touch ? 'Press and hold' : 'Right-click'} a move to delete it or make it the main line.</p>
        </>
      ) : (
        <p className="muted">Make a move on the board to start.</p>
      )}
    </div>
  )
}
