import { mergeTree, toPgn, type MoveNode } from '../chess/tree'
import { getRepertoire, listRepertoires, saveRepertoire, setMeta, type Repertoire } from './db'

export interface BackupFile {
  app: 'chess-trainer'
  version: 1
  exportedAt: string
  repertoires: Repertoire[]
}

export const LAST_BACKUP_KEY = 'lastBackupAt'

export async function createBackup(): Promise<BackupFile> {
  return { app: 'chess-trainer', version: 1, exportedAt: new Date().toISOString(), repertoires: await listRepertoires() }
}

function isNode(value: unknown): value is MoveNode {
  const n = value as MoveNode
  return (
    !!n && typeof n.fen === 'string' && typeof n.uci === 'string' && Array.isArray(n.children) && n.children.every(isNode)
  )
}

export function parseBackup(text: string): BackupFile {
  let data: BackupFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't a Chess Trainer backup.")
  }
  if (data?.app !== 'chess-trainer' || !Array.isArray(data.repertoires)) {
    throw new Error("That file isn't a Chess Trainer backup.")
  }
  for (const r of data.repertoires) {
    const valid =
      typeof r.id === 'string' && typeof r.name === 'string' && ['white', 'black'].includes(r.color) && isNode(r.root)
    if (!valid) throw new Error('The backup file is damaged.')
  }
  return data
}

/**
 * Restores a backup without losing anything: openings that already exist get
 * any missing moves added, and new openings are added as they are.
 */
export async function restoreBackup(backup: BackupFile): Promise<{ openings: number; moves: number }> {
  let openings = 0
  let moves = 0
  for (const r of backup.repertoires) {
    const existing = await getRepertoire(r.id)
    if (!existing) {
      await saveRepertoire(r)
      openings++
      continue
    }
    const { root, added } = mergeTree(existing.root, r.root)
    if (added) {
      await saveRepertoire({ ...existing, root, updatedAt: Date.now() })
      moves += added
    }
  }
  return { openings, moves }
}

export function repertoirePgn(r: Repertoire): string {
  return toPgn(r.root, {
    Event: r.name,
    Site: 'Chess Trainer',
    White: r.color === 'white' ? 'Me' : '?',
    Black: r.color === 'black' ? 'Me' : '?',
  })
}

export function fileSafe(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_ ]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'opening'
  )
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hands a file to the user: the share sheet on phones (so it can go to Google
 * Drive, Files, email…), otherwise a normal download.
 */
export async function saveFile(name: string, text: string, type: string): Promise<SaveResult> {
  const file = new File([text], name, { type })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}

export async function backUpNow(): Promise<SaveResult> {
  const backup = await createBackup()
  const date = new Date().toISOString().slice(0, 10)
  const result = await saveFile(`chess-trainer-backup-${date}.json`, JSON.stringify(backup), 'application/json')
  if (result !== 'cancelled') await setMeta(LAST_BACKUP_KEY, Date.now())
  return result
}
