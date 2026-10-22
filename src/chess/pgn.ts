// Reads PGN text (one or many games) into move trees, keeping variations and
// comments. Moves that can't be played are reported and the rest of that
// variation is skipped, so one typo doesn't lose the whole file.
import { Chess } from 'chess.js'
import { START_FEN, newRoot, type MoveNode } from './tree'

export interface PgnGame {
  headers: Record<string, string>
  root: MoveNode
  /** Problems found while reading, e.g. a move that isn't legal. */
  problems: string[]
}

const TOKEN =
  /\{[^}]*\}|;[^\n]*|\[\s*\w+\s+"(?:[^"\\]|\\.)*"\s*\]|\(|\)|\$\d+|1-0|0-1|1\/2-1\/2|\*|\d+\.+|[^\s(){};[\]]+/g

interface Builder extends PgnGame {
  node: MoveNode
  /** The node before the last move, which is where a variation branches from. */
  prev: MoveNode | null
  stack: { node: MoveNode; prev: MoveNode | null }[]
  /** A comment written just after "(" belongs to the variation's first move. */
  pendingComment: string
  /** Nesting depth while skipping a variation after a bad move; -1 when not skipping. */
  skip: number
  started: boolean
  ended: boolean
}

function newBuilder(): Builder {
  const root = newRoot()
  return {
    headers: {},
    root,
    problems: [],
    node: root,
    prev: null,
    stack: [],
    pendingComment: '',
    skip: -1,
    started: false,
    ended: false,
  }
}

/** Sets the starting position from the FEN header, once the moves begin. */
function start(b: Builder) {
  b.started = true
  const fen = b.headers.FEN
  if (!fen) return
  try {
    b.root.fen = new Chess(fen).fen()
  } catch {
    b.problems.push(`Bad starting position: ${fen}`)
    b.skip = 0
  }
  b.node = b.root
}

function cleanComment(text: string): string {
  // Drop clock and eval markers such as [%clk 0:03:00] that chess sites add.
  return text.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
}

function addComment(node: MoveNode, text: string) {
  node.comment = node.comment ? `${node.comment} ${text}` : text
}

function play(b: Builder, token: string) {
  const san = token
    .replace(/[?!]+$/, '')
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
  let move
  try {
    move = new Chess(b.node.fen).move(san)
  } catch {
    move = null
  }
  if (!move) {
    const where = b.node === b.root ? 'at the start' : `after ${b.node.san}`
    b.problems.push(`Couldn't play ${token} ${where}`)
    b.skip = 0
    return
  }
  let child = b.node.children.find((c) => c.uci === move.lan)
  if (!child) {
    child = { uci: move.lan, san: move.san, fen: move.after, children: [] }
    b.node.children.push(child)
  }
  if (b.pendingComment) {
    addComment(child, b.pendingComment)
    b.pendingComment = ''
  }
  b.prev = b.node
  b.node = child
}

function handle(b: Builder, token: string) {
  if (token === '(') {
    if (b.skip >= 0) {
      b.skip++
    } else if (!b.prev) {
      b.problems.push('A variation with no move before it was skipped')
      b.skip = 1
    } else {
      b.stack.push({ node: b.node, prev: b.prev })
      b.node = b.prev
      b.prev = null
    }
    return
  }
  if (token === ')') {
    if (b.skip > 0) {
      b.skip--
      return
    }
    // Closing the variation where a bad move happened ends the skip.
    if (b.skip === 0) b.skip = -1
    const saved = b.stack.pop()
    if (saved) ({ node: b.node, prev: b.prev } = saved)
    b.pendingComment = ''
    return
  }
  if (b.skip >= 0) return
  if (token.startsWith('{') || token.startsWith(';')) {
    const text = cleanComment(token.startsWith('{') ? token.slice(1, -1) : token.slice(1))
    if (!text) return
    if (b.prev === null && b.stack.length > 0) b.pendingComment += (b.pendingComment ? ' ' : '') + text
    else addComment(b.node, text)
    return
  }
  if (token.startsWith('$') || /^\d+\.+$/.test(token)) return
  if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') {
    if (b.stack.length === 0) b.ended = true
    return
  }
  play(b, token)
}

export function parsePgn(text: string): PgnGame[] {
  const games: Builder[] = []
  let game: Builder | null = null
  for (const [token] of text.matchAll(TOKEN)) {
    if (token.startsWith('[')) {
      // Tags after a game's moves start the next game.
      if (!game || game.started) {
        game = newBuilder()
        games.push(game)
      }
      const tag = token.match(/^\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"/)
      if (tag) game.headers[tag[1]] = tag[2].replace(/\\(.)/g, '$1')
      continue
    }
    if (!game || game.ended) {
      game = newBuilder()
      games.push(game)
    }
    if (!game.started) start(game)
    handle(game, token)
  }
  return games
    .filter((g) => g.root.children.length || Object.keys(g.headers).length)
    .map(({ headers, root, problems }) => ({ headers, root, problems }))
}

/** True when the game starts from the normal starting position. */
export function startsNormally(game: PgnGame): boolean {
  return game.root.fen === START_FEN
}
