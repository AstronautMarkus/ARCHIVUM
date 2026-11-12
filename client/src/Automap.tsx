import { useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { placeAt, tileAt, OUTDOOR, SOLID, TILE, type Layout } from './layout'

const SEEN = 8 // how many tiles away you make out the walls around you, unless a wall is in the way
const OPAQUE = '#H' // what you can't see past; railings, hedges, the fountain and the courtyard's void you can
const P = 8 // pixels per tile in the drawn-once map
const WALL = '#fc3c3c', LEDGE = '#b07840', DOOR = '#fcfc00', LIFT = '#3c6cfc'

// the tiles each floor's map has shown so far, `${tx},${tz}`; like a DOOM level's, kept until the page reloads
const seen: Set<string>[] = []

const at = (l: Layout, tx: number, tz: number) => tileAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE)
const walkable = (c: string) => !SOLID.includes(c)

// every tile within SEEN of yours that a straight line from you reaches before it hits a wall; the wall too
function reveal(l: Layout, s: Set<string>, tx: number, tz: number, add: (tx: number, tz: number) => void) {
  for (let dz = -SEEN; dz <= SEEN; dz++) {
    for (let dx = -SEEN; dx <= SEEN; dx++) {
      if (dx * dx + dz * dz > SEEN * SEEN || s.has(`${tx + dx},${tz + dz}`)) continue
      const n = 2 * Math.max(Math.abs(dx), Math.abs(dz))
      let clear = true
      for (let i = 1; i < n && clear; i++) clear = !OPAQUE.includes(at(l, Math.floor(tx + 0.5 + (dx * i) / n), Math.floor(tz + 0.5 + (dz * i) / n)))
      if (clear) { s.add(`${tx + dx},${tz + dz}`); add(tx + dx, tz + dz) }
    }
  }
}

// one tile onto the map, DOOM's way: a line wherever floor meets something solid, red for walls, brown for what
// you can see over; yellow across doorways
function drawTile(g: CanvasRenderingContext2D, l: Layout, tx: number, tz: number) {
  const c = at(l, tx, tz)
  if (!walkable(c)) return
  const x = (tx - l.x0) * P, y = (tz - l.z0) * P
  g.fillStyle = c === 'E' ? '#101c3c' : OUTDOOR.includes(c) ? '#0c160c' : '#1e1810'
  g.fillRect(x, y, P, P)
  const line = (color: string, x1: number, y1: number, x2: number, y2: number) => {
    g.strokeStyle = color
    g.beginPath()
    g.moveTo(x + x1 * P, y + y1 * P)
    g.lineTo(x + x2 * P, y + y2 * P)
    g.stroke()
  }
  if (c === '\\') return line(WALL, 0, 0, 1, 1) // the core's slanted walls: their diagonal is the wall
  if (c === '/') return line(WALL, 1, 0, 0, 1)
  for (const [a, b, x1, y1, x2, y2] of [[0, -1, 0, 0, 1, 0], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1], [1, 0, 1, 0, 1, 1]]) {
    const n = at(l, tx + a, tz + b)
    if (walkable(n) || '\\/'.includes(n)) continue
    line(c === 'E' ? LIFT : OPAQUE.includes(n) ? WALL : LEDGE, x1, y1, x2, y2)
  }
  if (c === 'D') {
    const across = !walkable(at(l, tx - 1, tz)) && !walkable(at(l, tx + 1, tz)) // walls either side: you go through north-south
    if (across) line(DOOR, 0, 0.5, 1, 0.5)
    else line(DOOR, 0.5, 0, 0.5, 1)
  }
}

// DOOM's automap, drawn into `el` every frame: what you've seen of the floor you're on, north up and centered on you,
// with where you are under it. `big` fills the screen and names the rooms you've seen
export function Automap({ el, layouts, floor, big }: { el: RefObject<HTMLCanvasElement | null>; layouts: Layout[]; floor: number; big: boolean }) {
  const { camera } = useThree()
  const dir = useMemo(() => new THREE.Vector3(), [])
  // each floor's map drawn so far, redrawn from `seen` when the building changes
  const maps = useMemo(() => [] as (CanvasRenderingContext2D | undefined)[], [layouts])
  const last = useRef('')
  useFrame(() => {
    const c = el.current, l = layouts[floor]
    if (!c || !l) return
    const s = (seen[floor] ??= new Set())
    let m = maps[floor]
    if (!m) {
      const cv = document.createElement('canvas')
      cv.width = l.rows[0].length * P
      cv.height = l.rows.length * P
      m = maps[floor] = cv.getContext('2d')!
      m.lineWidth = 1.5
      for (const k of s) { const [tx, tz] = k.split(',').map(Number); drawTile(m, l, tx, tz) }
      last.current = ''
    }
    const p = camera.position, tx = Math.floor(p.x / TILE), tz = Math.floor(p.z / TILE)
    const key = `${floor},${tx},${tz}`
    if (key !== last.current) {
      last.current = key
      reveal(l, s, tx, tz, (x, z) => drawTile(m, l, x, z))
    }

    if (c.width !== c.clientWidth || c.height !== c.clientHeight) [c.width, c.height] = [c.clientWidth, c.clientHeight]
    const g = c.getContext('2d')!, W = c.width, H = c.height, scale = (big ? 14 : 6) / P // screen pixels per map pixel
    g.clearRect(0, 0, W, H)
    g.fillStyle = big ? '#000d' : '#000e'
    g.fillRect(0, 0, W, H)
    g.save()
    g.translate(W / 2, H / 2)
    g.scale(scale, scale)
    g.translate(-(p.x / TILE - l.x0) * P, -(p.z / TILE - l.z0) * P)
    g.imageSmoothingEnabled = false
    g.drawImage(m.canvas, 0, 0)
    g.restore()

    // you: a white arrow the way you're looking
    camera.getWorldDirection(dir)
    g.save()
    g.translate(W / 2, H / 2)
    g.rotate(Math.atan2(dir.z, dir.x))
    g.fillStyle = '#fff'
    g.beginPath()
    g.moveTo(7, 0)
    g.lineTo(-5, -5)
    g.lineTo(-2, 0)
    g.lineTo(-5, 5)
    g.fill()
    g.restore()

    g.textAlign = 'center'
    g.font = `${big ? 22 : 16}px VT323, monospace`
    if (big) {
      g.fillStyle = '#e8d9a8'
      for (const r of l.rooms) {
        const cx = (r.area.x0 + r.area.x1 + 1) / 2, cz = (r.area.z0 + r.area.z1 + 1) / 2
        if (!s.has(`${Math.floor(cx)},${Math.floor(cz)}`)) continue
        g.fillText(r.title, W / 2 + (cx - p.x / TILE) * P * scale, H / 2 + (cz - p.z / TILE) * P * scale)
      }
    }
    g.fillStyle = '#ffcc33'
    g.fillText(placeAt(l, p.x, p.z), W / 2, H - 8)
  })
  return null
}
