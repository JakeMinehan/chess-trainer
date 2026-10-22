import { useEffect, useState } from 'react'

export interface ToastAction {
  label: string
  run(): void
}

export interface Toast {
  message: string
  action?: ToastAction
}

let listener: ((toast: Toast) => void) | null = null

/** Shows a short message at the bottom of the screen, optionally with a button such as Undo. */
export function toast(message: string, action?: ToastAction) {
  listener?.({ message, action })
}

export function useToast(): [Toast | null, () => void] {
  const [current, setCurrent] = useState<Toast | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    listener = (t) => {
      setCurrent(t)
      clearTimeout(timer)
      timer = setTimeout(() => setCurrent(null), t.action ? 6000 : 3000)
    }
    return () => {
      listener = null
      clearTimeout(timer)
    }
  }, [])
  return [current, () => setCurrent(null)]
}
