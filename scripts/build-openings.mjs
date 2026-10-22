// Builds public/openings.json from the Lichess opening list (CC0):
// https://github.com/lichess-org/chess-openings
// Each entry maps a position (FEN without move counters) to [ECO code, name].
import { writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const base = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/'
const openings = {}

for (const volume of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${base}${volume}.tsv`)
  if (!res.ok) throw new Error(`${volume}.tsv: HTTP ${res.status}`)
  const rows = (await res.text()).trim().split('\n').slice(1)
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t')
    const chess = new Chess()
    chess.loadPgn(pgn)
    const epd = chess.fen().split(' ').slice(0, 4).join(' ')
    openings[epd] ??= [eco, name]
  }
}

writeFileSync('public/openings.json', JSON.stringify(openings))
console.log(`Wrote ${Object.keys(openings).length} openings to public/openings.json`)
