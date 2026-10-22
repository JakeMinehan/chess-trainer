# Chess Trainer

A personal chess opening trainer that runs as an installable web app (PWA) and works offline.

- **Analyze**: move both sides on a free board, with a Stockfish eval bar, the engine's top 3 lines and the opening name. Variations are kept as branches.
- **Save line**: saves the moves from the start to the current position into one of your openings (or a new one). Moves already saved are reused.
- **Openings**: browse and edit each opening as a move tree. Add branches and write notes on any move. Press and hold a move (right-click on a computer) to delete it and everything after it, or to make it the main line. Deletes can be undone. Changes save as you go.
- **Settings**: board colour (green, brown, blue) and piece set (six sets from Lichess), plus backup. Everything lives on the device (IndexedDB). Back up to a JSON file, restore it (merges, never deletes) or export PGN for Lichess / En Croissant.

Planned next: Practice ("play a random line"), Learn mode with explanations, and chess.com / Lichess game import.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` and `npm run build` first copy the Stockfish engine from `node_modules/stockfish` into `public/engine/`.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Type-checks and builds to `dist/`, including the service worker |
| `npm run preview` | Serves the built app (use this to test offline mode) |
| `npm test` | Runs the move-tree tests |
| `npm run openings` | Rebuilds `public/openings.json` from the Lichess opening list |
| `npm run icons` | Regenerates the app icons from `public/logo.svg` |
| `npm run pieces` | Re-downloads the piece sets into `public/pieces/` and rewrites `src/pieces.css` |

## Getting it on a phone

A PWA has to be served over HTTPS once so it can install. Every push to `main` publishes the app to GitHub Pages through `.github/workflows/deploy.yml`, at:

**https://jakeminehan.github.io/chess-trainer/**

(One-time setup on GitHub: Settings → Pages → Source: GitHub Actions.) To host elsewhere, any static host works. Build with `BASE_PATH=/sub-folder/ npm run build` if the site lives in a sub-folder.

Then open the site on the phone and:

- **iPhone**: in Safari, tap Share → Add to Home Screen. Always open it from the icon: the home screen app has its own storage, separate from Safari.
- **Android**: in Chrome, tap ⋮ → Install app.

After the first visit the whole app, the engine and the openings list are cached, so it works with no connection.

## How it's put together

- `src/chess/tree.ts`: the move tree (add, delete, merge, PGN export). Covered by `tree.test.ts`.
- `src/chess/engine.ts`: Stockfish in a Web Worker over UCI, with one shared engine for the app.
- `src/chess/position.ts`: legal moves and SAN through chess.js.
- `src/storage/`: IndexedDB storage and backup/restore.
- `src/components/Workspace.tsx`: the board, engine panel, move list and controls, used by both Analyze and the opening editor.

## Credits and licences

- [Stockfish](https://stockfishchess.org/) through [stockfish.js](https://github.com/nmrugg/stockfish.js): GPL-3.0 (licence copied to `public/engine/COPYING.txt`).
- [Chessground](https://github.com/lichess-org/chessground) board: GPL-3.0.
- [chess.js](https://github.com/jhlywa/chess.js): BSD-2-Clause.
- Opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings): CC0.
- Piece sets from [Lichess](https://github.com/lichess-org/lila/blob/master/COPYING.md): Staunty, Cardinal, Fresca and Maestro by sadsnake1, and California by Jerry S. (all CC BY-NC-SA 4.0); Classic by Colin M.L. Burnett (GPLv2+).

Because Stockfish and Chessground are GPL-3.0, sharing this app with others means sharing its source under the GPL too. Most of the piece sets are also non-commercial only. Personal use is unaffected.
