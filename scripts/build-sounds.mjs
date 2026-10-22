// Downloads the free Lichess sound sets by Enigmahack (AGPLv3+) into public/sounds/.
// The "Wood" set, and the wrong-move and success sounds for every set, are
// made in code (src/lib/sound.ts), so they need no files.
// Licences: https://github.com/lichess-org/lila/blob/master/COPYING.md
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const sets = ['sfx', 'piano']
const free = new Set(['sfx', 'piano', 'nes', 'futuristic'])
const files = ['Move', 'Capture', 'Check', 'GenericNotify']
const base = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/'

/** Fetches a sound, following Lichess's git symlinks as long as they stay within the free sets. */
async function fetchSound(set, file, depth = 0) {
  const res = await fetch(`${base}${set}/${file}`)
  if (!res.ok) throw new Error(`${set}/${file}: HTTP ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > 200 || depth > 2) return data
  // A tiny file is a symlink whose content is the target path, e.g. "../sfx/GenericNotify.mp3".
  const target = data.toString().trim()
  const parts = target.split('/')
  const targetSet = parts.length > 1 ? parts[parts.length - 2] : set
  if (!free.has(targetSet)) throw new Error(`${set}/${file} links to the ${targetSet} set, which isn't free to use`)
  return fetchSound(targetSet, parts[parts.length - 1], depth + 1)
}

rmSync('public/sounds', { recursive: true, force: true })
for (const set of sets) {
  mkdirSync(`public/sounds/${set}`, { recursive: true })
  for (const file of files) writeFileSync(`public/sounds/${set}/${file}.mp3`, await fetchSound(set, `${file}.mp3`))
}
console.log(`Wrote ${sets.length} sound sets`)
