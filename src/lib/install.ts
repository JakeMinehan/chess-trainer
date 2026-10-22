import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

// Chrome and Edge fire this when the app can be installed. Keep it so the
// Backup page can show an Install button.
let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  listeners.forEach((l) => l())
})

export function isInstalled(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  )
}

export function useInstallPrompt(): (() => Promise<void>) | null {
  const [, rerender] = useState(0)
  useEffect(() => {
    const l = () => rerender((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  if (!deferred) return null
  return async () => {
    await deferred?.prompt()
    deferred = null
    listeners.forEach((l) => l())
  }
}
