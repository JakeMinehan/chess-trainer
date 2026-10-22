// Builds public/puzzles.json from the Lichess puzzle database (CC0):
// https://database.lichess.org/#puzzles
// Streams the whole file (about 300 MB) once and keeps a random sample of
// well-tested puzzles: an even spread across ratings, plus extra puzzles for
// each opening so "puzzles from my openings" has plenty to choose from.
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Readable, Transform } from 'node:stream'
import { createZstdDecompress } from 'node:zlib'

const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
const PER_RATING_BAND = 450 // per 100 rating points, 400–2999
const PER_OPENING = 60 // per opening family (e.g. Italian_Game)
const MIN_PLAYS = 300
const MIN_POPULARITY = 80
const MAX_DEVIATION = 90

// A seeded random number generator, so the same file gives the same sample.
let seed = 20261023
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 2 ** 32
}

/** Keeps a fair random sample of up to `size` items from a stream (reservoir sampling). */
class Reservoir {
  constructor(size) {
    this.size = size
    this.items = []
    this.seen = 0
  }
  add(item) {
    this.seen++
    if (this.items.length < this.size) this.items.push(item)
    else {
      const i = Math.floor(random() * this.seen)
      if (i < this.size) this.items[i] = item
    }
  }
}

/**
 * The file is written in many zstd frames, each preceded by a "skippable" frame
 * that holds its size (the pzstd format). Node's decoder rejects skippable
 * frames, so this removes them and passes the real frames through.
 */
function stripSkippableFrames() {
  let buf = Buffer.alloc(0)
  let skip = 0
  let pass = 0
  return new Transform({
    transform(chunk, _encoding, done) {
      buf = Buffer.concat([buf, chunk])
      const out = []
      while (buf.length) {
        if (skip) {
          const n = Math.min(skip, buf.length)
          buf = buf.subarray(n)
          skip -= n
        } else if (pass) {
          const n = Math.min(pass, buf.length)
          out.push(buf.subarray(0, n))
          buf = buf.subarray(n)
          pass -= n
        } else {
          if (buf.length < 12) break
          const magic = buf.readUInt32LE(0)
          if ((magic & 0xfffffff0) >>> 0 === 0x184d2a50) {
            const size = buf.readUInt32LE(4)
            if (size === 4) {
              pass = buf.readUInt32LE(8)
              buf = buf.subarray(12)
            } else {
              skip = size
              buf = buf.subarray(8)
            }
          } else {
            // A frame without a size label: pass everything else straight through.
            pass = Infinity
          }
        }
      }
      if (out.length) done(null, Buffer.concat(out))
      else done()
    },
  })
}

const bands = new Map()
const openings = new Map()
let rows = 0
let kept = 0

const res = await fetch(URL)
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const lines = createInterface({
  input: Readable.fromWeb(res.body).pipe(stripSkippableFrames()).pipe(createZstdDecompress()),
  crlfDelay: Infinity,
})

let header = null
for await (const line of lines) {
  if (!header) {
    header = line.split(',')
    console.log('columns:', header.join(', '))
    continue
  }
  rows++
  if (rows % 500000 === 0) console.log(`${rows.toLocaleString()} rows read…`)
  const [id, fen, moves, rating, deviation, popularity, plays, themes, , openingTags] = line.split(',')
  const r = Number(rating)
  if (Number(plays) < MIN_PLAYS || Number(popularity) < MIN_POPULARITY || Number(deviation) > MAX_DEVIATION) continue
  // The app always promotes to a queen, so skip puzzles that need a knight, rook or bishop.
  if (themes.includes('underPromotion')) continue
  if (r < 400 || r >= 3000) continue
  kept++
  const puzzle = { id, fen, moves, rating: r, themes: themes.split(' ').filter(Boolean), openings: (openingTags ?? '').split(' ').filter(Boolean) }
  const band = Math.floor(r / 100)
  if (!bands.has(band)) bands.set(band, new Reservoir(PER_RATING_BAND))
  bands.get(band).add(puzzle)
  const family = puzzle.openings[0]
  if (family) {
    if (!openings.has(family)) openings.set(family, new Reservoir(PER_OPENING))
    openings.get(family).add(puzzle)
  }
  if (rows <= 3) console.log('sample:', JSON.stringify(puzzle))
}

// Merge both samples and pack them compactly: themes and opening tags become indexes into lists.
const chosen = new Map()
for (const r of [...bands.values(), ...openings.values()]) for (const p of r.items) chosen.set(p.id, p)
const puzzles = [...chosen.values()].sort((a, b) => a.rating - b.rating)
const themeList = [...new Set(puzzles.flatMap((p) => p.themes))].sort()
const openingList = [...new Set(puzzles.flatMap((p) => p.openings))].sort()
const themeIndex = new Map(themeList.map((t, i) => [t, i]))
const openingIndex = new Map(openingList.map((t, i) => [t, i]))

const pack = {
  version: 1,
  source: 'Lichess puzzle database (CC0), https://database.lichess.org/#puzzles',
  built: new Date().toISOString().slice(0, 10),
  themes: themeList,
  openings: openingList,
  // [id, fen, moves, rating, theme indexes, opening indexes]
  puzzles: puzzles.map((p) => [p.id, p.fen, p.moves, p.rating, p.themes.map((t) => themeIndex.get(t)), p.openings.map((o) => openingIndex.get(o))]),
}
writeFileSync('public/puzzles.json', JSON.stringify(pack))
console.log(`Read ${rows.toLocaleString()} puzzles, ${kept.toLocaleString()} passed the quality filter.`)
console.log(`Wrote ${puzzles.length.toLocaleString()} puzzles (${openings.size} opening families) to public/puzzles.json`)
