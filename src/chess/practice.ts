// Picks lines to practise and schedules them with simple spaced repetition
// (Leitner boxes): a clean run moves a line up a box and spaces the next
// review further out; any mistake sends it back to the first box.
import type { Side } from './position'
import type { MoveNode, Path } from './tree'

export interface Line {
  repId: string
  /** Moves from the start to the end of the line. */
  path: Path
  key: string
  /** How many moves in the line are yours to find. */
  yourMoves: number
}

export interface Schedule {
  box: number
  due: number
}

/** Days until the next review for each box. */
export const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60]
const DAY = 24 * 60 * 60 * 1000

export function lineKey(repId: string, path: Path): string {
  return `${repId}|${path.join(' ')}`
}

/** True when the move at `ply` (1 = White's first move) is played by `color`. */
export function isMoveBy(ply: number, color: Side): boolean {
  return (ply % 2 === 1) === (color === 'white')
}

/** Every line (start to a final move) in an opening that has at least one move for you to find. */
export function linesOf(repId: string, color: Side, root: MoveNode): Line[] {
  const lines: Line[] = []
  const walk = (node: MoveNode, path: Path) => {
    if (!node.children.length) {
      const yourMoves = path.filter((_, i) => isMoveBy(i + 1, color)).length
      if (path.length && yourMoves) lines.push({ repId, path, key: lineKey(repId, path), yourMoves })
      return
    }
    for (const c of node.children) walk(c, [...path, c.uci])
  }
  walk(root, [])
  return lines
}

export function nextSchedule(previous: Schedule | undefined, clean: boolean, now: number): Schedule {
  const box = clean ? Math.min((previous?.box ?? 0) + 1, BOX_DAYS.length - 1) : 0
  return { box, due: now + BOX_DAYS[box] * DAY }
}

export function isDue(schedule: Schedule | undefined, now: number): boolean {
  return !schedule || schedule.due <= now
}

/**
 * Chooses the next line: due lines first, favouring the ones you know least.
 * Avoids repeating `previousKey` when there is any other choice.
 */
export function pickLine(
  lines: Line[],
  schedules: Map<string, Schedule>,
  now: number,
  previousKey?: string,
  random = Math.random,
): Line | undefined {
  const fresh = lines.length > 1 ? lines.filter((l) => l.key !== previousKey) : lines
  const due = fresh.filter((l) => isDue(schedules.get(l.key), now))
  const pool = due.length ? due : fresh
  const weights = pool.map((l) => 1 / (1 + (schedules.get(l.key)?.box ?? 0)))
  let r = random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r < 0) return pool[i]
  }
  return pool[pool.length - 1]
}
