import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { SaveLineDialog } from '../components/SaveLineDialog'
import { Workspace } from '../components/Workspace'
import { useOpening } from '../chess/openings'
import type { Side } from '../chess/position'
import {
  lineAt,
  newRoot,
  nodesAlong,
  positionKey,
  positionKeys,
  validPath,
  type MoveNode,
  type Path,
} from '../chess/tree'
import { toast } from '../lib/toast'
import { getMeta, listRepertoires, setMeta, type Repertoire } from '../storage/db'

const ANALYSIS_KEY = 'analysis'

interface Analysis {
  root: MoveNode
  path: Path
  orientation: Side
}

const fresh = (orientation: Side = 'white'): Analysis => ({ root: newRoot(), path: [], orientation })

/** A free board for trying moves for both sides. The board is kept between visits. */
export function AnalyzePage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [repertoires, setRepertoires] = useState<Repertoire[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getMeta<Analysis>(ANALYSIS_KEY).then((saved) =>
      setAnalysis(saved ? { ...saved, path: validPath(saved.root, saved.path) } : fresh()),
    )
    listRepertoires().then(setRepertoires)
  }, [])

  useEffect(() => {
    if (!analysis) return
    const timer = setTimeout(() => setMeta(ANALYSIS_KEY, analysis), 300)
    return () => clearTimeout(timer)
  }, [analysis])

  const nodes = useMemo(() => (analysis ? nodesAlong(analysis.root, analysis.path) : []), [analysis])
  const opening = useOpening(nodes)
  const keys = useMemo(() => repertoires.map((r) => ({ r, keys: positionKeys(r.root) })), [repertoires])

  if (!analysis) return null
  const { root, path, orientation } = analysis
  const here = positionKey(nodes[nodes.length - 1].fen)
  const containing = path.length ? keys.filter((k) => k.keys.has(here)).map((k) => k.r) : []

  // Clears straight away; Undo brings the old board back.
  const reset = () => {
    const before = analysis
    setAnalysis(fresh(orientation))
    toast('Board cleared', { label: 'Undo', run: () => setAnalysis(before) })
  }

  return (
    <>
      <Workspace
        root={root}
        path={path}
        orientation={orientation}
        onChange={(nextRoot, nextPath) => setAnalysis((a) => a && { ...a, root: nextRoot, path: nextPath })}
        onFlip={() => setAnalysis({ ...analysis, orientation: orientation === 'white' ? 'black' : 'white' })}
        notice={
          containing.length > 0 && (
            <div className="notice">
              In your openings:{' '}
              {containing.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ', '}
                  <a href={`#/openings/${r.id}`}>{r.name}</a>
                </span>
              ))}
            </div>
          )
        }
        actions={
          <>
            <button className="btn primary" onClick={() => setSaving(true)} disabled={!path.length}>
              <Icon name="save" /> Save line
            </button>
            <button className="btn" onClick={reset} disabled={!root.children.length}>
              <Icon name="reset" /> New board
            </button>
          </>
        }
      />
      {saving && (
        <SaveLineDialog
          line={lineAt(root, path)}
          repertoires={repertoires}
          side={orientation}
          suggestedName={opening?.name.split(':')[0] ?? 'My opening'}
          onClose={() => setSaving(false)}
          onSaved={(saved) => {
            setSaving(false)
            setRepertoires((list) => [saved, ...list.filter((r) => r.id !== saved.id)])
          }}
        />
      )}
    </>
  )
}
