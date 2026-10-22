// Keeps the installed app up to date. The service worker serves the saved copy
// straight away (so the app works offline), checks for a newer version when the
// app is opened or brought back to the front, and downloads it in the
// background. When it's ready, the app shows a Reload button.
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

const HOUR = 60 * 60 * 1000

let ready = false
let registration: ServiceWorkerRegistration | undefined
const listeners = new Set<() => void>()

const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    ready = true
    listeners.forEach((l) => l())
  },
  onRegisteredSW(_url, reg) {
    registration = reg
    if (!reg) return
    const check = () => {
      if (navigator.onLine) void reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check()
    })
    setInterval(check, HOUR)
  },
})

/** Switches to the downloaded version and reloads the page. */
export function reloadToUpdate() {
  void applyUpdate(true)
}

/** Asks the server for a newer version now. Resolves to true if one is on its way. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false
  await registration.update()
  return ready || !!registration.installing || !!registration.waiting
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ready,
  )
}
