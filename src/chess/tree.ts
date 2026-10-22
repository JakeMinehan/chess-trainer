// A repertoire (and the Analyze board) is a tree of moves. The root is the
// starting position; each child is a move that can be played from its parent.
// Trees are treated as immutable: every edit returns a new root.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface MoveNode {
  /** The move in UCI form, e.g. "e2e4" or "e7e8q". Empty for the root. */
  uci: string
  san: string
  /** The position after this move. */
  fen: string
  comment?: string
  children: MoveNode[]
}

/** A move without its children. */
export type MoveData = Omit<MoveNode, 'children'>

/**
 * The UCI moves from the root to a node. Sibling moves are always different,
 * so a path names exactly one node.
 */
export type Path = string[]

export function newRoot(fen = START_FEN): MoveNode {
  return { uci: '', san: '', fen, children: [] }
}

/** The root followed by every node along the path (stops early if the path leaves the tree). */
export function nodesAlong(root: MoveNode, path: Path): MoveNode[] {
  const nodes = [root]
  let node = root
  for (const uci of path) {
    const next = node.children.find((c) => c.uci === uci)
    if (!next) break
    nodes.push(next)
    node = next
  }
  return nodes
}

export function nodeAt(root: MoveNode, path: Path): MoveNode | undefined {
  const nodes = nodesAlong(root, path)
  return nodes.length === path.length + 1 ? nodes[nodes.length - 1] : undefined
}

/** The longest part of the path that exists in the tree. */
export function validPath(root: MoveNode, path: Path): Path {
  return nodesAlong(root, path)
    .slice(1)
    .map((n) => n.uci)
}

function updateAt(node: MoveNode, path: Path, fn: (n: MoveNode) => MoveNode): MoveNode {
  if (path.length === 0) return fn(node)
  const [head, ...rest] = path
  return { ...node, children: node.children.map((c) => (c.uci === head ? updateAt(c, rest, fn) : c)) }
}

/** Adds a move after the node at `path`. Does nothing if that move is already there. */
export function addMove(root: MoveNode, path: Path, move: MoveData): MoveNode {
  return updateAt(root, path, (node) =>
    node.children.some((c) => c.uci === move.uci)
      ? node
      : { ...node, children: [...node.children, { ...move, children: [] }] },
  )
}

/** Removes the node at `path` and every move after it. */
export function deleteAt(root: MoveNode, path: Path): MoveNode {
  if (path.length === 0) return { ...root, children: [] }
  const uci = path[path.length - 1]
  return updateAt(root, path.slice(0, -1), (n) => ({ ...n, children: n.children.filter((c) => c.uci !== uci) }))
}

export function setComment(root: MoveNode, path: Path, comment: string): MoveNode {
  const text = comment.trim()
  return updateAt(root, path, ({ comment: _old, ...node }) => (text ? { ...node, comment: text } : node))
}

/** Makes the node at `path` the first choice (main line) among its siblings. */
export function promote(root: MoveNode, path: Path): MoveNode {
  if (path.length === 0) return root
  const uci = path[path.length - 1]
  return updateAt(root, path.slice(0, -1), (n) => {
    const chosen = n.children.find((c) => c.uci === uci)
    return chosen ? { ...n, children: [chosen, ...n.children.filter((c) => c !== chosen)] } : n
  })
}

/** Follows the first child from `path` to the end of that line. */
export function mainlineFrom(root: MoveNode, path: Path): Path {
  const node = nodeAt(root, path)
  if (!node) return path
  const result = [...path]
  let current = node
  while (current.children.length) {
    current = current.children[0]
    result.push(current.uci)
  }
  return result
}

/** The moves from the root to the node at `path`, without their children. */
export function lineAt(root: MoveNode, path: Path): MoveData[] {
  return nodesAlong(root, path)
    .slice(1)
    .map(({ children: _children, ...move }) => move)
}

/** Adds a line of moves to a tree, reusing moves that are already there. */
export function mergeLine(root: MoveNode, line: MoveData[]): { root: MoveNode; added: number } {
  let added = 0
  const merge = (node: MoveNode, i: number): MoveNode => {
    if (i >= line.length) return node
    const move = line[i]
    const existing = node.children.find((c) => c.uci === move.uci)
    if (existing) {
      let merged = merge(existing, i + 1)
      if (!merged.comment && move.comment) merged = { ...merged, comment: move.comment }
      return { ...node, children: node.children.map((c) => (c === existing ? merged : c)) }
    }
    added += line.length - i
    let chain: MoveNode | undefined
    for (let j = line.length - 1; j >= i; j--) chain = { ...line[j], children: chain ? [chain] : [] }
    return { ...node, children: [...node.children, chain!] }
  }
  return { root: merge(root, 0), added }
}

/** Adds every move in `extra` to `base`. Nothing in `base` is removed or reordered. */
export function mergeTree(base: MoveNode, extra: MoveNode): { root: MoveNode; added: number } {
  let added = 0
  const merge = (a: MoveNode, b: MoveNode): MoveNode => {
    const children = [...a.children]
    for (const child of b.children) {
      const i = children.findIndex((c) => c.uci === child.uci)
      if (i === -1) {
        children.push(child)
        added += countNodes(child)
      } else {
        children[i] = merge(children[i], child)
      }
    }
    const comment = a.comment || b.comment
    return comment ? { ...a, comment, children } : { ...a, children }
  }
  return { root: merge(base, extra), added }
}

function countNodes(node: MoveNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}

export function countMoves(root: MoveNode): number {
  return countNodes(root) - 1
}

/** The number of lines, i.e. moves with nothing after them. */
export function countLines(root: MoveNode): number {
  const leaves = (n: MoveNode): number => (n.children.length ? n.children.reduce((s, c) => s + leaves(c), 0) : 1)
  return root.children.length ? leaves(root) : 0
}

/** A FEN without the move counters, so the same position matches however it was reached. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

/** The position keys of every move in the tree (not the starting position). */
export function positionKeys(root: MoveNode): Set<string> {
  const keys = new Set<string>()
  const walk = (n: MoveNode) => {
    for (const c of n.children) {
      keys.add(positionKey(c.fen))
      walk(c)
    }
  }
  walk(root)
  return keys
}

// ---- PGN export ----

/** The move text for a move at `ply` (1 = White's first move). */
export function moveLabel(san: string, ply: number, forceNumber: boolean): string {
  const number = Math.ceil(ply / 2)
  if (ply % 2 === 1) return `${number}. ${san}`
  return forceNumber ? `${number}... ${san}` : san
}

const pgnComment = (text: string) => `{ ${text.replace(/[{}]/g, '')} }`

function pgnLine(parent: MoveNode, ply: number, forceNumber: boolean, out: string[]) {
  let node = parent
  let force = forceNumber
  while (node.children.length) {
    const [main, ...variations] = node.children
    out.push(moveLabel(main.san, ply, force))
    force = false
    if (main.comment) {
      out.push(pgnComment(main.comment))
      force = true
    }
    for (const v of variations) {
      const sub = [moveLabel(v.san, ply, true)]
      if (v.comment) sub.push(pgnComment(v.comment))
      pgnLine(v, ply + 1, !!v.comment, sub)
      out.push(`(${sub.join(' ')})`)
      force = true
    }
    node = main
    ply++
  }
}

function wrap(text: string, width = 80): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

/** The whole tree as one PGN game, with branches as variations. */
export function toPgn(root: MoveNode, headers: Record<string, string>): string {
  const tags = { ...headers, Result: '*' }
  const head = Object.entries(tags)
    .map(([k, v]) => `[${k} "${v.replace(/["\\]/g, '')}"]`)
    .join('\n')
  const moves: string[] = []
  if (root.comment) moves.push(pgnComment(root.comment))
  pgnLine(root, 1, true, moves)
  moves.push('*')
  return `${head}\n\n${wrap(moves.join(' '))}\n`
}
