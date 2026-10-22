// Draws the app icon (a Staunty knight on chess.com-style green) and writes
// every size the app needs into public/:
//   logo.svg + pwa-*.png  rounded corners, for browsers and Android
//   apple-touch-icon      full square, because iPhones round the corners themselves
//   maskable-icon         smaller knight, so Android's circle/squircle masks don't cut it
//   favicon.ico           48×48 for old browsers
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const knight = readFileSync('public/pieces/staunty/wN.svg').toString('base64')

function icon({ rounded, knightSize }) {
  const offset = (512 - knightSize) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8bc25a"/>
      <stop offset="1" stop-color="#4e7f30"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
      <feOffset dy="12"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  <image filter="url(#shadow)" x="${offset}" y="${offset - 14}" width="${knightSize}" height="${knightSize}" href="data:image/svg+xml;base64,${knight}"/>
</svg>`
}

const rounded = icon({ rounded: true, knightSize: 400 })
const square = icon({ rounded: false, knightSize: 400 })
const maskable = icon({ rounded: false, knightSize: 300 })

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()

writeFileSync('public/logo.svg', rounded)
for (const size of [64, 192, 512]) writeFileSync(`public/pwa-${size}x${size}.png`, await png(rounded, size))
writeFileSync('public/apple-touch-icon-180x180.png', await png(square, 180))
writeFileSync('public/maskable-icon-512x512.png', await png(maskable, 512))

// An .ico file is a small header followed by a PNG.
const favicon = await png(rounded, 48)
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // one image
header.writeUInt8(48, 6) // width
header.writeUInt8(48, 7) // height
header.writeUInt16LE(1, 10) // colour planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(favicon.length, 14) // image size
header.writeUInt32LE(22, 18) // image offset
writeFileSync('public/favicon.ico', Buffer.concat([header, favicon]))

console.log('Wrote icons to public/')
