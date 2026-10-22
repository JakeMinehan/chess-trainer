// Copies the single-threaded "lite" Stockfish build into public/engine so it is
// served (and cached for offline use) next to the app. The loader looks for a
// .wasm file with the same name as its script, so both are renamed together.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'

const src = 'node_modules/stockfish/bin/'
const dest = 'public/engine/'
mkdirSync(dest, { recursive: true })

for (const file of readdirSync(src)) {
  const match = file.match(/-lite-single\.(js|wasm)$/)
  if (match) copyFileSync(src + file, `${dest}stockfish.${match[1]}`)
}
copyFileSync('node_modules/stockfish/Copying.txt', `${dest}COPYING.txt`)
