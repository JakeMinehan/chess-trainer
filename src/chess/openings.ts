import { useEffect, useState } from 'react'
import { positionKey, type MoveNode } from './tree'

export interface Opening {
  eco: string
  name: string
}

type OpeningTable = Record<string, [string, string]>

let table: Promise<OpeningTable> | null = null

function loadOpenings(): Promise<OpeningTable> {
  table ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((r) => r.json() as Promise<OpeningTable>)
    .catch(() => {
      table = null
      return {}
    })
  return table
}

/** The name of the most recent named position along a line, if any. */
export function useOpening(nodes: MoveNode[]): Opening | null {
  const [openings, setOpenings] = useState<OpeningTable | null>(null)
  useEffect(() => {
    loadOpenings().then(setOpenings)
  }, [])
  if (!openings) return null
  for (let i = nodes.length - 1; i > 0; i--) {
    const hit = openings[positionKey(nodes[i].fen)]
    if (hit) return { eco: hit[0], name: hit[1] }
  }
  return null
}
