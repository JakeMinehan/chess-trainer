// The sounds made in code: wooden knocks for moves, and simple tones for
// check, mistakes and success. Kept separate from playback so it can be tested.
export type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'error' | 'success' | 'notify'

export function render(name: SoundName, rate: number): Float32Array {
  const lengths: Record<SoundName, number> = { move: 0.12, capture: 0.16, castle: 0.24, check: 0.4, error: 0.32, success: 0.7, notify: 0.35 }
  const out = new Float32Array(Math.ceil(lengths[name] * rate))
  let seed = 7
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 31 - 1
  }

  /** A wooden knock: a burst of noise ringing at `pitch`, plus a soft low thump. */
  const knock = (at: number, gain: number, pitch: number) => {
    const start = Math.floor(at * rate)
    const r = Math.exp((-Math.PI * 350) / rate)
    const w = (2 * Math.PI * pitch) / rate
    const a1 = 2 * r * Math.cos(w)
    const a2 = -r * r
    const burst = rate * 0.004
    let y1 = 0
    let y2 = 0
    for (let i = 0; start + i < out.length; i++) {
      const t = i / rate
      const excite = i < burst ? noise() * (1 - i / burst) : 0
      const y = excite + a1 * y1 + a2 * y2
      y2 = y1
      y1 = y
      const thump = Math.sin(2 * Math.PI * 165 * t) * Math.exp(-t / 0.022)
      out[start + i] += gain * (y * 0.05 + thump * 0.55)
    }
  }

  /** A soft bell-like tone that fades out. */
  const tone = (at: number, freq: number, length: number, gain: number, buzzy = false) => {
    const start = Math.floor(at * rate)
    const end = Math.min(out.length, start + Math.floor(length * rate))
    for (let i = start; i < end; i++) {
      const t = (i - start) / rate
      const envelope = Math.min(1, t / 0.005) * Math.exp(-t / (length / 4))
      const phase = 2 * Math.PI * freq * t
      const wave = buzzy ? Math.sin(phase) + 0.35 * Math.sin(3 * phase) : Math.sin(phase) + 0.2 * Math.sin(2 * phase)
      out[i] += gain * envelope * wave
    }
  }

  switch (name) {
    case 'move':
      knock(0, 1, 1500)
      break
    case 'capture':
      knock(0, 1, 1250)
      knock(0.035, 0.8, 950)
      break
    case 'castle':
      knock(0, 1, 1500)
      knock(0.11, 0.9, 1350)
      break
    case 'check':
      knock(0, 1, 1500)
      tone(0.03, 1320, 0.3, 0.25)
      break
    case 'error':
      tone(0, 196, 0.13, 0.5, true)
      tone(0.15, 165, 0.15, 0.5, true)
      break
    case 'success':
      tone(0, 784, 0.4, 0.45)
      tone(0.13, 1175, 0.55, 0.4)
      break
    case 'notify':
      tone(0, 988, 0.3, 0.4)
      break
  }

  // Normalise so every sound peaks at the same level.
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.8
  return out
}
