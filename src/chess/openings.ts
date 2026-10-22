import { useEffect, useState } from 'react'
import { positionKey } from './tree'

export interface Opening {
  eco: string
  name: string
}

export type OpeningTable = Record<string, [string, string]>

let table: Promise<OpeningTable> | null = null

export function loadOpenings(): Promise<OpeningTable> {
  table ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((r) => r.json() as Promise<OpeningTable>)
    .catch(() => {
      table = null
      return {}
    })
  return table
}

/** The most recent named position in a list of positions (FENs), if any. */
export function findOpening(openings: OpeningTable, fens: string[]): Opening | null {
  for (let i = fens.length - 1; i >= 0; i--) {
    const hit = openings[positionKey(fens[i])]
    if (hit) return { eco: hit[0], name: hit[1] }
  }
  return null
}

/** The name of the most recent named position along a line (the first node is the start and is skipped). */
export function useOpening(nodes: { fen: string }[]): Opening | null {
  const [openings, setOpenings] = useState<OpeningTable | null>(null)
  useEffect(() => {
    loadOpenings().then(setOpenings)
  }, [])
  if (!openings) return null
  return findOpening(
    openings,
    nodes.slice(1).map((n) => n.fen),
  )
}
