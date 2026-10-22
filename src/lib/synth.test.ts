import { describe, expect, it } from 'vitest'
import { render, type SoundName } from './synth'

const names: SoundName[] = ['move', 'capture', 'check', 'castle', 'error', 'success', 'notify']

describe('sounds made in code', () => {
  it.each(names)('%s is real audio at the right level', (name) => {
    const samples = render(name, 44100)
    expect(samples.length).toBeGreaterThan(44100 * 0.1)
    expect(samples.every(Number.isFinite)).toBe(true)
    const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak).toBeCloseTo(0.8, 5)
    // Not just a click: there's sound energy beyond the first few milliseconds.
    const tail = samples.slice(Math.floor(44100 * 0.01)).reduce((s, v) => s + v * v, 0)
    expect(tail).toBeGreaterThan(1)
  })

  it('fades out instead of stopping abruptly', () => {
    for (const name of names) {
      const samples = render(name, 44100)
      const end = samples.slice(-100).reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(end).toBeLessThan(0.1)
    }
  })
})
