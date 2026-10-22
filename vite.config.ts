import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const stockfish = JSON.parse(readFileSync('node_modules/stockfish/package.json', 'utf8'))

export default defineConfig({
  // Set BASE_PATH (e.g. "/chess-trainer/") when hosting under a sub-folder like GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
  server: {
    // Wait for a file to finish changing before reloading it. Without this, several
    // quick saves in a row on Windows can leave the dev server serving an old copy.
    watch: { awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } },
  },
  define: {
    __STOCKFISH_VERSION__: JSON.stringify(stockfish.buildVersion ?? stockfish.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Chess Trainer',
        short_name: 'Chess Trainer',
        description: 'Analyse positions and build your own opening repertoire. Works offline.',
        theme_color: '#161512',
        background_color: '#161512',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything, including the Stockfish engine and the openings list,
        // so the whole app works with no connection after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,json,txt}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
