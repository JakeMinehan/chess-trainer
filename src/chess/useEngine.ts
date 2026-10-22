import { useEffect, useState } from 'react'
import { engine, type EngineState } from './engine'

/** Analyses `fen` while it is set. Pass null to stop the engine. */
export function useEngine(fen: string | null): EngineState | null {
  const [state, setState] = useState<EngineState | null>(null)

  useEffect(() => engine.subscribe(setState), [])

  useEffect(() => {
    if (!fen) {
      engine.stop()
      return
    }
    engine.analyze(fen)
    // Stop while the app is in the background to save battery.
    const onVisibility = () => (document.hidden ? engine.stop() : engine.analyze(fen))
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [fen])

  useEffect(() => () => engine.stop(), [])

  return state && state.fen === fen ? state : null
}
