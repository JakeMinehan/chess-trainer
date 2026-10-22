// Runs Stockfish in a Web Worker and talks to it over UCI. One engine is shared
// by the whole app so the WASM file is only loaded once.

export interface EngineLine {
  multipv: number
  depth: number
  /** Centipawns from White's point of view. */
  cp?: number
  /** Moves to mate from White's point of view (negative = Black mates). */
  mate?: number
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

type Listener = (state: EngineState) => void

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
    this.booting ??= new Promise((resolve, reject) => {
      const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`)
      this.worker = worker
      let ready = false
      worker.onmessage = (e: MessageEvent) => {
        const line = String(e.data)
        if (!ready && line === 'readyok') {
          ready = true
          resolve()
        } else {
          this.handle(line)
        }
      }
      worker.onerror = (e) => reject(e)
      this.post('uci')
      this.post(`setoption name MultiPV value ${MULTI_PV}`)
      this.post('setoption name Hash value 32')
      this.post('isready')
    })
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
    if (!line.startsWith('info') || this.stopping || !this.state) return
    const parts = line.split(' ')
    const pvAt = parts.indexOf('pv')
    const scoreAt = parts.indexOf('score')
    if (pvAt === -1 || scoreAt === -1 || parts.includes('lowerbound') || parts.includes('upperbound')) return

    const value = (key: string) => {
      const i = parts.indexOf(key)
      return i === -1 ? undefined : Number(parts[i + 1])
    }
    // UCI scores are from the side to move; store them from White's side.
    const sign = this.state.fen.split(' ')[1] === 'b' ? -1 : 1
    const score = sign * Number(parts[scoreAt + 2])
    const entry: EngineLine = {
      multipv: value('multipv') ?? 1,
      depth: value('depth') ?? 0,
      pv: parts.slice(pvAt + 1),
      ...(parts[scoreAt + 1] === 'mate' ? { mate: score } : { cp: score }),
    }
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

/** White's chance of winning (0–1), using the same curve as Lichess. */
export function whiteWinChance(line?: EngineLine): number {
  if (!line) return 0.5
  if (line.mate !== undefined) return line.mate > 0 ? 1 : 0
  const cp = Math.max(-1000, Math.min(1000, line.cp ?? 0))
  return 1 / (1 + Math.exp(-0.00368208 * cp))
}

export function formatScore(line: EngineLine): string {
  if (line.mate !== undefined) return `#${line.mate}`
  const pawns = (line.cp ?? 0) / 100
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}
