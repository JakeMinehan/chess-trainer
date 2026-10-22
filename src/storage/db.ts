import { openDB, type DBSchema } from 'idb'
import type { Side } from '../chess/position'
import { newRoot, type MoveNode } from '../chess/tree'

export interface Repertoire {
  id: string
  name: string
  /** The side you play in this repertoire. */
  color: Side
  root: MoveNode
  createdAt: number
  updatedAt: number
}

interface Schema extends DBSchema {
  repertoires: { key: string; value: Repertoire }
  meta: { key: string; value: unknown }
}

// Everything is stored on this device in IndexedDB. Nothing is sent anywhere.
const db = openDB<Schema>('chess-trainer', 1, {
  upgrade(database) {
    database.createObjectStore('repertoires', { keyPath: 'id' })
    database.createObjectStore('meta')
  },
})

function makeId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

export function newRepertoire(name: string, color: Side): Repertoire {
  const now = Date.now()
  return { id: makeId(), name, color, root: newRoot(), createdAt: now, updatedAt: now }
}

export async function listRepertoires(): Promise<Repertoire[]> {
  const all = await (await db).getAll('repertoires')
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getRepertoire(id: string): Promise<Repertoire | undefined> {
  return (await db).get('repertoires', id)
}

export async function saveRepertoire(repertoire: Repertoire): Promise<void> {
  await (await db).put('repertoires', repertoire)
  void requestPersistence()
}

export async function deleteRepertoire(id: string): Promise<void> {
  await (await db).delete('repertoires', id)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db).get('meta', key) as Promise<T | undefined>
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db).put('meta', value, key)
}

/**
 * Asks the browser not to clear this app's data when the device runs low on
 * space. Browsers decide for themselves; installed apps are usually allowed.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
