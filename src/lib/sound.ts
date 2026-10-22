// Move sounds. "Wood" is made in code (src/lib/synth.ts: a short knock that rings
// like a small wooden body); "SFX" and "Piano" are free Lichess sets by Enigmahack
// (AGPLv3+) in public/sounds. The wrong-move buzz and the success chime are
// always made in code. Everything plays through Web Audio for low latency.
import { getPrefs } from './prefs'
import { render, type SoundName } from './synth'

export type { SoundName }

/** Which recorded file each sound uses in the Lichess sets (the rest are made in code). */
const FILES: Partial<Record<SoundName, string>> = {
  move: 'Move',
  capture: 'Capture',
  check: 'Check',
  castle: 'Move',
  notify: 'GenericNotify',
}

const VOLUME = 0.8

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

// Phones only allow sound after the first tap, so wake the audio then.
for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => audio(), { capture: true, passive: true })

function made(c: AudioContext, name: SoundName): AudioBuffer {
  const data = render(name, c.sampleRate)
  const buffer = c.createBuffer(1, data.length, c.sampleRate)
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  return buffer
}

// ---- Loading and playing ----

const buffers = new Map<string, Promise<AudioBuffer | null>>()

function load(c: AudioContext, set: string, name: SoundName): Promise<AudioBuffer | null> {
  const key = `${set}/${name}`
  let buffer = buffers.get(key)
  if (!buffer) {
    const file = set === 'wood' ? undefined : FILES[name]
    buffer = file
      ? fetch(`${import.meta.env.BASE_URL}sounds/${set}/${file}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((b) => c.decodeAudioData(b))
          .catch(() => made(c, name))
      : Promise.resolve(made(c, name))
    buffers.set(key, buffer)
  }
  return buffer
}

export function play(name: SoundName) {
  const set = getPrefs().sound
  if (set === 'off') return
  const c = audio()
  if (!c) return
  void load(c, set, name).then((buffer) => {
    if (!buffer) return
    const source = c.createBufferSource()
    const gain = c.createGain()
    gain.gain.value = VOLUME
    source.buffer = buffer
    source.connect(gain).connect(c.destination)
    source.start()
  })
}

/** Plays the right sound for a move, from its SAN (e.g. "Nxe5+", "O-O"). */
export function playMove(san: string) {
  if (san.includes('+') || san.includes('#')) play('check')
  else if (san.startsWith('O-O')) play('castle')
  else if (san.includes('x')) play('capture')
  else play('move')
}

/** A short preview of a sound set: a move, a capture, then the success chime. */
export function preview() {
  play('move')
  setTimeout(() => play('capture'), 350)
  setTimeout(() => play('success'), 800)
}
