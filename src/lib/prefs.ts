import { useSyncExternalStore } from 'react'

export const BOARD_THEMES = [
  { id: 'green', label: 'Green', light: '#ebecd0', dark: '#739552' },
  { id: 'brown', label: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', label: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
] as const

export const PIECE_SETS = [
  { id: 'staunty', label: 'Staunty' },
  { id: 'cardinal', label: 'Cardinal' },
  { id: 'fresca', label: 'Fresca' },
  { id: 'california', label: 'California' },
  { id: 'maestro', label: 'Maestro' },
  { id: 'cburnett', label: 'Classic' },
] as const

export const SOUND_SETS = [
  { id: 'wood', label: 'Wood' },
  { id: 'sfx', label: 'SFX' },
  { id: 'piano', label: 'Piano' },
  { id: 'off', label: 'Off' },
] as const

export interface Prefs {
  board: string
  pieces: string
  sound: string
  /** Puzzle filters, remembered between visits. */
  puzzleTheme: string
  puzzleMine: boolean
}

const KEY = 'prefs'
export const DEFAULT_PREFS: Prefs = { board: 'green', pieces: 'staunty', sound: 'wood', puzzleTheme: 'all', puzzleMine: false }
const defaults = DEFAULT_PREFS

function load(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

let prefs = load()
const listeners = new Set<() => void>()

/** Puts the board colours and piece set on <html> so the CSS can use them. */
function apply() {
  const theme = BOARD_THEMES.find((t) => t.id === prefs.board) ?? BOARD_THEMES[0]
  const root = document.documentElement
  root.style.setProperty('--sq-light', theme.light)
  root.style.setProperty('--sq-dark', theme.dark)
  root.dataset.pieces = PIECE_SETS.some((p) => p.id === prefs.pieces) ? prefs.pieces : defaults.pieces
}

apply()

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  setPrefs({ [key]: value })
}

/** Changes several settings at once (e.g. when restoring a backup). */
export function setPrefs(changes: Partial<Prefs>) {
  prefs = { ...prefs, ...changes }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Not saved; the choice still applies until the app is closed.
  }
  apply()
  listeners.forEach((l) => l())
}

/** The current preferences, for code outside React (e.g. sounds). */
export function getPrefs(): Prefs {
  return prefs
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => prefs,
  )
}
