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
