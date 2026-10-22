// Runs Stockfish in Web Workers and talks to it over UCI. The live engine is
// shared by the whole app so the WASM file is only loaded once; game reviews
// use a separate worker so they don't interrupt live analysis.

/** A score from White's point of view. */
export interface Score {
  /** Centipawns. */
  cp?: number
  /** Moves to mate (negative = Black mates). */
  mate?: number
}

export interface EngineLine extends Score {
  multipv: number
  depth: number
  /** The engine's best line, in UCI moves. */
  pv: string[]
}

export interface EngineState {
  fen: string
  depth: number
  lines: EngineLine[]
  searching: boolean
  /** True once the search reached full depth without being stopped. */
  complete: boolean
}

export const MAX_DEPTH = 20
const MULTI_PV = 3

/** Starts a Stockfish worker; resolves once it is ready for commands. */
function startStockfish(options: Record<string, number>, onLine: (line: string) => void) {
  const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`)
  const ready = new Promise<void>((resolve, reject) => {
    let isReady = false
    worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data)
      if (!isReady && line === 'readyok') {
        isReady = true
        resolve()
      } else {
        onLine(line)
      }
    }
    worker.onerror = (e) => reject(e)
  })
  worker.postMessage('uci')
  for (const [name, value] of Object.entries(options)) worker.postMessage(`setoption name ${name} value ${value}`)
  worker.postMessage('isready')
  return { worker, ready }
}

/** Reads one "info … score … pv …" line. Returns null for lines without a usable score. */
function parseInfo(line: string, fen: string): EngineLine | null {
  if (!line.startsWith('info')) return null
  const parts = line.split(' ')
  const pvAt = parts.indexOf('pv')
  const scoreAt = parts.indexOf('score')
  if (pvAt === -1 || scoreAt === -1 || parts.includes('lowerbound') || parts.includes('upperbound')) return null
  const value = (key: string) => {
    const i = parts.indexOf(key)
    return i === -1 ? undefined : Number(parts[i + 1])
  }
  // UCI scores are from the side to move; store them from White's side.
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1
  const score = sign * Number(parts[scoreAt + 2])
  return {
    multipv: value('multipv') ?? 1,
    depth: value('depth') ?? 0,
    pv: parts.slice(pvAt + 1),
    ...(parts[scoreAt + 1] === 'mate' ? { mate: score } : { cp: score }),
  }
}

type Listener = (state: EngineState) => void

/** The live engine: analyses one position at a time and streams its lines. */
class Engine {
  private worker: Worker | null = null
  private booting: Promise<void> | null = null
  private listeners = new Set<Listener>()
  private state: EngineState | null = null
  private searching = false
  private stopping = false
  private queued: string | null = null
  private emitTimer: ReturnType<typeof setTimeout> | null = null

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    if (this.state) listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async analyze(fen: string) {
    await this.boot()
    if (this.state?.fen === fen) {
      // Already searching this position, or already finished it.
      if (this.searching && !this.stopping) {
        this.queued = null
        return
      }
      if (!this.searching && this.state.complete) return
    }
    if (this.searching) {
      this.queued = fen
      this.requestStop()
    } else {
      this.start(fen)
    }
  }

  stop() {
    this.queued = null
    this.requestStop()
  }

  private boot(): Promise<void> {
    if (!this.booting) {
      const { worker, ready } = startStockfish({ MultiPV: MULTI_PV, Hash: 32 }, (line) => this.handle(line))
      this.worker = worker
      this.booting = ready
    }
    return this.booting
  }

  private post(command: string) {
    this.worker?.postMessage(command)
  }

  private requestStop() {
    if (this.searching && !this.stopping) {
      this.stopping = true
      this.post('stop')
    }
  }

  private start(fen: string) {
    this.searching = true
    this.stopping = false
    this.state = { fen, depth: 0, lines: [], searching: true, complete: false }
    this.emit(true)
    this.post(`position fen ${fen}`)
    this.post(`go depth ${MAX_DEPTH}`)
  }

  private handle(line: string) {
    if (line.startsWith('bestmove')) {
      const wasStopped = this.stopping
      this.searching = false
      this.stopping = false
      if (this.queued) {
        const next = this.queued
        this.queued = null
        this.start(next)
      } else if (this.state) {
        this.state = { ...this.state, searching: false, complete: !wasStopped }
        this.emit(true)
      }
      return
    }
    // Ignore output from a search we have asked to stop.
    if (this.stopping || !this.state) return
    const entry = parseInfo(line, this.state.fen)
    if (!entry) return
    const lines = [...this.state.lines.filter((l) => l.multipv !== entry.multipv), entry].sort(
      (a, b) => a.multipv - b.multipv,
    )
    const depth = entry.multipv === 1 ? entry.depth : this.state.depth
    this.state = { ...this.state, lines, depth }
    this.emit()
  }

  /** Engine output arrives very fast, so updates are batched to a few per second. */
  private emit(now = false) {
    if (now) {
      if (this.emitTimer) clearTimeout(this.emitTimer)
      this.emitTimer = null
      this.notify()
    } else if (!this.emitTimer) {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null
        this.notify()
      }, 120)
    }
  }

  private notify() {
    if (this.state) for (const l of this.listeners) l(this.state)
  }
}

export const engine = new Engine()

/** A separate engine for scoring many positions one after another (game review). */
export class BatchEngine {
  private worker: Worker | null = null
  private booting: Promise<void> | null = null
  private pending: { fen: string; last: EngineLine | null; resolve(line: EngineLine | null): void } | null = null

  async evaluate(fen: string, depth: number): Promise<EngineLine | null> {
    if (!this.booting) {
      const { worker, ready } = startStockfish({ MultiPV: 1, Hash: 16 }, (line) => this.handle(line))
      this.worker = worker
      this.booting = ready
    }
    await this.booting
    return new Promise((resolve) => {
      this.pending = { fen, last: null, resolve }
      this.worker!.postMessage(`position fen ${fen}`)
      this.worker!.postMessage(`go depth ${depth}`)
    })
  }

  private handle(line: string) {
    const p = this.pending
    if (!p) return
    if (line.startsWith('bestmove')) {
      this.pending = null
      p.resolve(p.last)
      return
    }
    const entry = parseInfo(line, p.fen)
    if (entry) p.last = entry
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.booting = null
    this.pending?.resolve(null)
    this.pending = null
  }
}

/** White's chance of winning (0–1), using the same curve as Lichess. */
export function whiteWinChance(score?: Score): number {
  if (!score) return 0.5
  if (score.mate !== undefined) return score.mate > 0 ? 1 : 0
  const cp = Math.max(-1000, Math.min(1000, score.cp ?? 0))
  return 1 / (1 + Math.exp(-0.00368208 * cp))
}

export function formatScore(score: Score): string {
  if (score.mate !== undefined) return `#${score.mate}`
  const pawns = (score.cp ?? 0) / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}
