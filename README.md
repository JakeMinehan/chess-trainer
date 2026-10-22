# Chess Trainer

A personal chess opening trainer that runs as an installable web app (PWA) and works offline.

- **Analyze**: move both sides on a free board, with a Stockfish eval bar, the engine's top 3 lines and the opening name. Variations are kept as branches.
- **Save line**: saves the moves from the start to the current position into one of your openings (or a new one). Moves already saved are reused.
- **Openings**: browse and edit each opening as a move tree. Add branches and write notes on any move. Press and hold a move (right-click on a computer) to delete it and everything after it, or to make it the main line. Deletes can be undone. Changes save as you go. **Import** reads PGN (pasted or from a file, any number of games, with branches and comments) into a new or existing opening.
- **Practice**: the app picks one of your lines and plays the other side, and you find your moves to the end. Wrong moves are refused and Hint shows an arrow. Lines are scheduled with spaced repetition (Leitner boxes): clean runs push a line further out, and any slip brings it back the same day.
- **Puzzles** (under Practice): about 19,000 puzzles picked from the Lichess puzzle database, built into the app so they work offline. Your own puzzle rating (Elo-style, starting at 1500), theme filters (mates, forks, pins, sacrifices, endgames…) and **From my openings**, which matches puzzles to the openings you play, for your side. Wrong moves are refused; hints and Show solution count as a miss. Missed puzzles come back for review after 1 and 3 days. Analyse opens any puzzle on a full board with Stockfish.
- **Games**: imports your games from chess.com's public API (username only, no login) and shows where each game left your openings: you went off your line, your opponent played something new, or you reached the end. From a game you can add the opponent's new move to your opening, or run a Stockfish review that marks inaccuracies, mistakes and blunders (Lichess thresholds) with an evaluation graph.
- **Settings**: board colour (green, brown, blue), piece set (six sets from Lichess) and move sounds (Wood, SFX, Piano or off), plus backup. Everything lives on the device (IndexedDB). Back up to a JSON file, restore it (merges, never deletes) or export PGN for Lichess / En Croissant.

Planned next: Learn mode with explanations for each move.

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
| `npm test` | Runs the tests (move tree, PGN, prep check, practice, puzzles, review, sounds) |
| `npm run openings` | Rebuilds `public/openings.json` from the Lichess opening list |
| `npm run icons` | Draws the app icon (Staunty knight on green) and writes every icon size into `public/` |
| `npm run pieces` | Re-downloads the piece sets into `public/pieces/` and rewrites `src/pieces.css` |
| `npm run puzzles` | Streams the Lichess puzzle database (about 300 MB) and rebuilds `public/puzzles.json` |
| `npm run sounds` | Re-downloads the SFX and Piano sound sets into `public/sounds/` |

## Getting it on a phone

A PWA has to be served over HTTPS once so it can install. Every push to `main` publishes the app to GitHub Pages through `.github/workflows/deploy.yml`, at:

**https://jakeminehan.github.io/chess-trainer/**

(One-time setup on GitHub: Settings → Pages → Source: GitHub Actions.) To host elsewhere, any static host works. Build with `BASE_PATH=/sub-folder/ npm run build` if the site lives in a sub-folder.

Then open the site on the phone and:

- **iPhone**: in Safari, tap Share → Add to Home Screen. Always open it from the icon: the home screen app has its own storage, separate from Safari.
- **Android**: in Chrome, tap ⋮ → Install app.

After the first visit the whole app, the engine and the openings list are cached, so it works with no connection.

**Updates:** the installed app checks for a new version when it's opened or brought back to the front (and hourly while open). A new version downloads in the background, then an **Update ready · Reload** bar appears. Nothing changes until you tap Reload, so an update never interrupts a practice line. Settings → App version shows the build time and has a Check for updates button.

**Home screen icon:** drawn by `scripts/build-icons.mjs` (`npm run icons`). iPhones keep the icon from when the app was installed, so a new icon needs a reinstall there. Back up first, because removing the app also removes its saved openings.

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
- Puzzles from the [Lichess puzzle database](https://database.lichess.org/#puzzles): CC0.
- SFX and Piano sounds by [Enigmahack](https://github.com/Enigmahack), from Lichess: AGPLv3+. The Wood sounds, the wrong-move buzz and the success chime are made in code (`src/lib/synth.ts`).
- Piece sets from [Lichess](https://github.com/lichess-org/lila/blob/master/COPYING.md): Staunty, Cardinal, Fresca and Maestro by sadsnake1, and California by Jerry S. (all CC BY-NC-SA 4.0); Classic by Colin M.L. Burnett (GPLv2+). The app icon uses the Staunty knight.

Because Stockfish and Chessground are GPL-3.0, sharing this app with others means sharing its source under the GPL too. Most of the piece sets are also non-commercial only. Personal use is unaffected.
