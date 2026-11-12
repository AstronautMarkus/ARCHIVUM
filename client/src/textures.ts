import * as THREE from 'three'

// The museum's own pixel-art textures: a white gallery inside, grey cantera stone for the courtyard arcade. Each is
// painted once on a small canvas, 64 px across a 2 m tile like a Doom flat, with a fixed seed so everyone sees the
// same speckles. The whites stay a little warm and grainy so walls don't turn into flat glare at 240 lines.

type Rand = () => number

function texture(w: number, h: number, paint: (g: CanvasRenderingContext2D, rand: Rand) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  let seed = 11
  paint(c.getContext('2d')!, () => (seed = (seed * 16807) % 2147483647) / 2147483647)
  const t = new THREE.CanvasTexture(c)
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

const pick = (rand: Rand, colors: string[]) => colors[Math.floor(rand() * colors.length)]

// n single pixels in the given colors, scattered over a w x h rectangle at (x, y)
function speckle(g: CanvasRenderingContext2D, rand: Rand, n: number, colors: string[], x = 0, y = 0, w = 64, h = 64) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pick(rand, colors)
    g.fillRect(x + Math.floor(rand() * w), y + Math.floor(rand() * h), 1, 1)
  }
}

// joints of a grid of slabs `size` px square
function joints(g: CanvasRenderingContext2D, color: string, size: number) {
  g.fillStyle = color
  for (let k = 0; k < 64; k += size) {
    g.fillRect(0, k, 64, 1)
    g.fillRect(k, 0, 1, 64)
  }
}

// white-painted brick: rows of bricks in slightly different whites, lit along the top, over pale grey mortar
export const whiteBrick = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#c9c5bd'
  g.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 8) {
    for (let x = y % 16 ? 8 : 0; x < 64; x += 16) {
      const color = pick(rand, ['#efece6', '#e9e5de', '#f3f1ec', '#e4e0d8'])
      for (const wrap of [0, -64]) { // the brick hanging off the right edge comes back in on the left
        g.fillStyle = color
        g.fillRect(x + wrap, y, 15, 7)
        g.fillStyle = '#f9f8f4'
        g.fillRect(x + wrap, y, 15, 1)
        g.fillStyle = '#d8d4cc'
        g.fillRect(x + wrap, y + 6, 15, 1)
      }
    }
  }
  speckle(g, rand, 260, ['#dcd8d0', '#f8f7f3', '#d3cfc6'])
})

// polished marble in 1 m squares, `color` and white like a chessboard: each floor of the museum has its own color
export const checker = (color: string) => texture(64, 64, (g, rand) => {
  for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
    g.fillStyle = (x + y) % 64 ? '#efede8' : color
    g.fillRect(x, y, 32, 32)
  }
  speckle(g, rand, 500, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.1)']) // veins that work on any color
  joints(g, 'rgba(0,0,0,0.25)', 32)
})

// pale limestone slabs in two shades, for the entrance
export const limestone = () => texture(64, 64, (g, rand) => {
  for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
    g.fillStyle = (x + y) % 64 ? '#d9d2c5' : '#cdc5b6'
    g.fillRect(x, y, 32, 32)
  }
  speckle(g, rand, 500, ['#c4bcad', '#e2dccf', '#bdb4a4'])
  joints(g, '#ada391', 32)
})

// grey volcanic stone (cantera) in ashlar courses, pitted, for the arcade, beams and fountain
export const cantera = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#8c847e'
  g.fillRect(0, 0, 64, 64)
  speckle(g, rand, 1100, ['#7d756f', '#9a928b', '#6e6660', '#a39b94'])
  g.fillStyle = '#665e58'
  for (let y = 0; y < 64; y += 16) {
    g.fillRect(0, y, 64, 1)
    for (let x = y % 32 ? 16 : 0; x < 64; x += 32) g.fillRect(x, y, 1, 16)
  }
})

// pale castle stone in big ashlar blocks, 1 m x 0.5 m, each lit along its top, over darker joints: the castle's outside
export const ashlar = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#a69e90'
  g.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 16) {
    for (let x = y % 32 ? 16 : 0; x < 64; x += 32) {
      const color = pick(rand, ['#dcd6c9', '#d4cdbf', '#e0dbcf', '#cfc8ba'])
      for (const wrap of [0, -64]) { // the block hanging off the right edge comes back in on the left
        g.fillStyle = color
        g.fillRect(x + wrap, y, 31, 15)
        g.fillStyle = '#ebe7dd'
        g.fillRect(x + wrap, y, 31, 1)
        g.fillStyle = '#bfb7a8'
        g.fillRect(x + wrap, y + 14, 31, 1)
      }
    }
  }
  speckle(g, rand, 600, ['#c7bfb0', '#e4dfd5', '#b9b1a2'])
})

// a slate roof: rows of blue-grey shingles, each overlapping the row below, its lower edge in shadow
export const slate = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#232c3b'
  g.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 8) {
    for (let x = (y / 8) % 2 ? -4 : 0; x < 64; x += 8) {
      g.fillStyle = pick(rand, ['#4a5a75', '#435270', '#51627e', '#3e4c66'])
      g.fillRect(x, y, 7, 7)
      g.fillStyle = '#5f7090'
      g.fillRect(x, y, 7, 1)
    }
  }
  speckle(g, rand, 150, ['#36425a', '#5a6b88'])
})

// a polished oak floor: long planks in staggered rows, their ends and edges dark
export const planks = () => texture(64, 64, (g, rand) => {
  for (let y = 0; y < 64; y += 8) {
    for (let x = (y / 8) % 2 ? -16 : 0; x < 64; x += 32) {
      g.fillStyle = pick(rand, ['#8a5a32', '#94633a', '#7e5230', '#9b6b40'])
      g.fillRect(x, y, 32, 8)
      g.fillStyle = '#5c3a1f'
      g.fillRect(x, y + 7, 32, 1)
      g.fillRect(x + 31, y, 1, 8)
    }
  }
  speckle(g, rand, 300, ['#a87848', '#704826', 'rgba(255,255,255,0.08)'])
})

// a bookcase: four shelves of books in every color and height, on dark wood
export const books = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#3a2414'
  g.fillRect(0, 0, 64, 64)
  for (let y = 2; y < 64; y += 16) {
    for (let x = 2; x < 62;) {
      const w = 2 + Math.floor(rand() * 3), h = 9 + Math.floor(rand() * 4)
      g.fillStyle = pick(rand, ['#7a1d1d', '#1d3f7a', '#2d6a35', '#c99a1e', '#5a2a6d', '#d8d0c0', '#8a4a1a', '#1c1c1e'])
      g.fillRect(x, y + 13 - h, w, h)
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fillRect(x, y + 13 - h, 1, h)
      x += w + (rand() < 0.1 ? 3 : 0)
    }
    g.fillStyle = '#5c3a1f' // the shelf
    g.fillRect(0, y + 13, 64, 3)
  }
})

// leather or cloth in one color, faintly worn
export const cloth = (color: string) => texture(16, 16, (g, rand) => {
  g.fillStyle = color
  g.fillRect(0, 0, 16, 16)
  speckle(g, rand, 40, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.15)'], 0, 0, 16, 16)
})

// the island's edge: a fringe of grass over brown earth with stones in it, for a band 64 px tall
export const earth = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#6b4a2e'
  g.fillRect(0, 0, 64, 64)
  speckle(g, rand, 900, ['#5a3d25', '#7a5636', '#4c321e', '#836043'])
  for (let i = 0; i < 14; i++) { // stones
    g.fillStyle = pick(rand, ['#8c847e', '#7d756f', '#9a928b'])
    g.fillRect(Math.floor(rand() * 60), 12 + Math.floor(rand() * 48), 3 + Math.floor(rand() * 3), 2 + Math.floor(rand() * 2))
  }
  for (let x = 0; x < 64; x++) { // the grass hangs over the edge, ragged
    g.fillStyle = pick(rand, ['#3c7040', '#4a8a3c', '#2d5a35'])
    g.fillRect(x, 0, 1, 4 + Math.floor(rand() * 5))
  }
})

// the rock under the island: layers of dark stone, cracked
export const rock = () => texture(64, 64, (g, rand) => {
  for (let y = 0; y < 64; y += 8) {
    g.fillStyle = pick(rand, ['#5b5048', '#4e443d', '#665a50', '#463d37'])
    g.fillRect(0, y, 64, 8)
    g.fillStyle = '#3a322c'
    g.fillRect(0, y + 7, 64, 1)
  }
  speckle(g, rand, 700, ['#3a322c', '#776a5f', '#52473f'])
  for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rand() * 64), Math.floor(rand() * 56), 1, 4 + Math.floor(rand() * 8))
})

// a low wall of pale ashlar with merlons on top, the gaps between them transparent: 2 m along, 1.6 m tall
export const crenel = () => texture(64, 52, (g, rand) => {
  g.fillStyle = '#a69e90'
  g.fillRect(0, 12, 64, 40)
  for (let y = 12; y < 52; y += 10) {
    for (let x = (y / 10) % 2 ? 8 : -8; x < 64; x += 16) {
      g.fillStyle = pick(rand, ['#dcd6c9', '#d4cdbf', '#e0dbcf', '#cfc8ba'])
      g.fillRect(x, y, 15, 9)
    }
  }
  for (const x of [8, 40]) { // two merlons, and between them the sky
    g.fillStyle = '#d6d0c3'
    g.fillRect(x, 0, 16, 12)
    g.fillStyle = '#ebe7dd'
    g.fillRect(x, 0, 16, 1)
  }
  speckle(g, rand, 200, ['#c7bfb0', '#b9b1a2'], 0, 12, 64, 40)
})

// soft white clouds on transparency, wrapping at every edge so they tile
export const clouds = () => {
  const t = texture(256, 256, (g, rand) => {
    for (let i = 0; i < 70; i++) {
      const x = rand() * 256, y = rand() * 256, r = 10 + rand() * 34, a = 0.25 + rand() * 0.45
      for (const dx of [-256, 0, 256]) {
        for (const dy of [-256, 0, 256]) {
          const puff = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
          puff.addColorStop(0, `rgba(255,255,255,${a})`)
          puff.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = puff
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
        }
      }
    }
  })
  t.magFilter = t.minFilter = THREE.LinearFilter // soft, unlike everything else
  return t
}

// a dark gallery ceiling crossed by two beams, each lit along one edge
function paintCeiling(g: CanvasRenderingContext2D, rand: Rand) {
  g.fillStyle = '#28282c'
  g.fillRect(0, 0, 64, 64)
  speckle(g, rand, 200, ['#2e2e33', '#222226'])
  for (const y of [0, 32]) {
    g.fillStyle = '#18181b'
    g.fillRect(0, y, 64, 8)
    g.fillStyle = '#38383e'
    g.fillRect(0, y + 8, 64, 1)
  }
}
export const ceiling = () => texture(64, 64, paintCeiling)

// the same ceiling with a track along it carrying two spotlights
export const spots = () => texture(64, 64, (g, rand) => {
  paintCeiling(g, rand)
  g.fillStyle = '#7a7a80'
  g.fillRect(0, 18, 64, 2)
  for (const x of [14, 46]) {
    g.fillStyle = '#dcdce0'
    g.fillRect(x - 3, 20, 7, 5)
    g.fillStyle = '#fff6d6'
    g.fillRect(x - 2, 25, 5, 2)
    g.fillStyle = '#4a473e' // the glow it throws on the ceiling
    g.fillRect(x - 4, 27, 9, 1)
  }
})

// wrought-iron railing on a transparent background: a handrail, two lower rails and balusters between them
export const railing = () => texture(64, 32, (g) => {
  g.fillStyle = '#1b1b1d'
  g.fillRect(0, 0, 64, 3)
  g.fillRect(0, 22, 64, 1)
  g.fillRect(0, 29, 64, 3)
  for (let x = 2; x < 64; x += 5) g.fillRect(x, 3, 1, 26)
})

// a clipped hedge: dark leaves, the lighter ones catching the sun
export const hedge = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#21402a'
  g.fillRect(0, 0, 64, 64)
  speckle(g, rand, 1400, ['#2d5a35', '#3c7040', '#183222', '#4a8a3c', '#5f9e47'])
})

// the museum's cloth for flags and banners, w x h px: deep red in a gold border, with a gold A
export const pennant = (w: number, h: number) => texture(w, h, (g) => {
  g.fillStyle = '#d6a419'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#8f1d1d'
  g.fillRect(1, 1, w - 2, h - 2)
  g.fillStyle = '#d6a419'
  g.font = `bold ${Math.min(w, h) - 6}px serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('A', w / 2, Math.min(w, h) / 2 + 1)
})

// the wall texture with a window painted on: one per tile and storey, kept clear of the cell's bottom quarter
// so a short top band (parapet) shows plain wall. Arched, it's the castle's; with no wall, the window stands alone
// on a transparent cell, to stick on anything
export function withWindow(tex: THREE.Texture | null, arched = false) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  if (tex) g.drawImage(tex.image as HTMLImageElement, 0, 0, 128, 128)
  // the opening, `i` px in from its frame: a rectangle, or one whose top is a half circle
  const opening = (i: number) => {
    g.beginPath()
    if (arched) {
      g.arc(64, 54, 30 - i, Math.PI, 0)
      g.lineTo(94 - i, 94 - i)
      g.lineTo(34 + i, 94 - i)
    } else g.rect(34 + i, 24 + i, 60 - 2 * i, 70 - 2 * i)
    g.fill()
  }
  g.fillStyle = '#2b2b30'
  opening(0)
  const glass = g.createLinearGradient(0, 28, 0, 90)
  glass.addColorStop(0, '#9fc3e6')
  glass.addColorStop(1, '#2d4f7a')
  g.fillStyle = glass
  opening(4)
  g.fillStyle = '#2b2b30'
  g.fillRect(62, 28, 4, 62)
  g.fillRect(38, 56, 52, 4)
  return new THREE.CanvasTexture(c)
}

// ---- the town ----

// plaster, nearly white so each building's color tints it, a little uneven
export const stucco = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#f1efe9'
  g.fillRect(0, 0, 64, 64)
  speckle(g, rand, 500, ['#e6e3dc', '#faf9f6', '#dedad2'])
})

// clay roof tiles in rows, each row's lower edge in shadow
export const roofTiles = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#7a3420'
  g.fillRect(0, 0, 64, 64)
  for (let y = 0; y < 64; y += 8) {
    for (let x = (y / 8) % 2 ? -4 : 0; x < 64; x += 8) {
      g.fillStyle = pick(rand, ['#b5532f', '#a84a2a', '#c0613a', '#9c4325'])
      g.fillRect(x, y, 7, 6)
      g.fillStyle = '#d27a52'
      g.fillRect(x + 1, y, 5, 1)
    }
  }
})

// a house's window with its shutters open either side, on transparency
export const shutters = (color: string) => texture(32, 32, (g) => {
  g.fillStyle = color
  for (const x of [1, 24]) g.fillRect(x, 4, 7, 26)
  g.fillStyle = 'rgba(0,0,0,0.25)'
  for (const x of [1, 24]) for (let y = 7; y < 30; y += 4) g.fillRect(x, y, 7, 1)
  g.fillStyle = '#ece8df'
  g.fillRect(8, 3, 16, 28)
  const glass = g.createLinearGradient(0, 5, 0, 29)
  glass.addColorStop(0, '#9fc3e6')
  glass.addColorStop(1, '#2d4f7a')
  g.fillStyle = glass
  g.fillRect(10, 5, 12, 24)
  g.fillStyle = '#ece8df'
  g.fillRect(15, 5, 2, 24)
  g.fillRect(10, 15, 12, 2)
})

// a shop's front, one per 2 m of ground floor: a sign band, a big window with goods in it and a dark frame
export const shopfront = () => texture(64, 96, (g, rand) => {
  g.fillStyle = '#e9e4d8'
  g.fillRect(0, 0, 64, 96)
  g.fillStyle = '#3b2f2a'
  g.fillRect(2, 8, 60, 14)
  g.fillStyle = '#e9c46a'
  for (let x = 6; x < 58; x += 6) g.fillRect(x, 13, 3, 4) // the letters of its name
  g.fillStyle = '#2b2b30'
  g.fillRect(4, 28, 56, 64)
  const glass = g.createLinearGradient(0, 30, 0, 90)
  glass.addColorStop(0, '#8fb3d6')
  glass.addColorStop(1, '#25405f')
  g.fillStyle = glass
  g.fillRect(7, 31, 50, 58)
  for (let i = 0; i < 9; i++) { // goods on the shelves
    g.fillStyle = pick(rand, ['#c0392b', '#e9c46a', '#2a9d8f', '#f4a261', '#ffffff'])
    g.fillRect(9 + Math.floor(rand() * 44), 64 + Math.floor(rand() * 18), 4, 6)
  }
})

// a tower's glass curtain wall, 2 m by one storey: sky-blue panes with a sheen, in a dark grid
export const curtain = () => texture(64, 96, (g, rand) => {
  g.fillStyle = '#26303c'
  g.fillRect(0, 0, 64, 96)
  for (const x of [2, 33]) {
    const glass = g.createLinearGradient(x, 0, x + 30, 96)
    glass.addColorStop(0, '#a9c6e0')
    glass.addColorStop(0.5, '#5d88b3')
    glass.addColorStop(1, '#2f5277')
    g.fillStyle = glass
    g.fillRect(x, 2, 29, 82)
  }
  g.fillStyle = '#3c4a58' // the spandrel at the floor line
  g.fillRect(0, 86, 64, 10)
  speckle(g, rand, 60, ['rgba(255,255,255,0.25)'], 2, 2, 60, 80)
})

// light concrete, for slabs, cornices and rooftops
export const concrete = () => texture(64, 64, (g, rand) => {
  g.fillStyle = '#bdb8ae'
  g.fillRect(0, 0, 64, 64)
  speckle(g, rand, 700, ['#aea99f', '#c9c5bc', '#a49f95'])
})
