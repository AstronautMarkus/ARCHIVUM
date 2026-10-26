// Turns the museum into tile maps, one per floor; floors stack WALL_H apart. Tile (tx, tz) covers
// world [tx*TILE, (tx+1)*TILE). Every floor is a school-like ring: a lobby at the west end, corridors along the
// north and south sides of a central courtyard, and the rooms outside the corridors.
// The building is the same box on every floor and stands in the middle of its city block: on the ground floor a
// garden, a sidewalk and a street go all the way around it, with the city beyond. You come in from the street
// through the lobby, which has the reception desk, and the courtyard has grass, paths, a fountain and cherry
// trees. Upper floors look down into it from balconies.
// Past the city to the west there's a forest, to the north a neighbourhood of houses along alleys, and in the
// corner between them a little shrine; the street on the block's north side runs on west between shrine and forest.
// A glass elevator rides up and down the courtyard's west edge, its doors opening onto the lobby of each floor.
// Rooms have a fixed width and grow in depth with their exhibits, so new content never moves existing rooms;
// more rooms only make the building (and its courtyard) longer, the same for every floor, and push the block out.
export const TILE = 2
export const WALL_H = 3.5 // also one storey: floors stack with no gap
export const DOOR_H = 2.2
export const SPAWN = { x: 2.5 * TILE, z: 1.5 * TILE } // a safe spot in the lobby, on every floor
// wall, fountain, reception desk, courtyard void, the shrine's hall; posts and the elevator are special
export const SOLID = '#FRvH'
export const MAX_FLOORS = 99
export const COLUMN = 0.35 // half the width of a column
export const TORII = 2.3 // how far each pillar of the shrine's torii stands from the middle of its path
// what stops you around each prop, as half the width of its trunk, post or base
const BODY = { tree: COLUMN, oak: COLUMN, sakura: 0.25, statue: 0.45, lamp: 0.2, light: 0.25 }
const LANTERN = 0.3, PILLAR = 0.25 // the shrine's stone lanterns and the torii's pillars
// the elevator shaft: two tiles wide on the courtyard's west edge, beside the entrance axis (rows 6-7) so walking
// in from the street you see straight into the courtyard; its doors face the lobby. z: center, w: width along z,
// door: width of the opening, which leaves room on both sides for the open doors to slide away
export const LIFT = { tx: 6, tz0: 4, tz1: 5, x0: 6 * TILE, z: 5 * TILE, w: 2 * TILE, door: 1.6 }
const ROOM_W = 5
// rows of the ring: corridor 0-1, arcade 2, courtyard 3-10, arcade 11, corridor 12-13
const RING_END = 13, COURT_Z0 = 3, COURT_Z1 = 10, LOBBY_X1 = 5, COURT_X0 = 7
// the block around the building, by distance from its outer walls in tiles: a stone walk, the garden, the
// sidewalk, the street and the far sidewalk; past that, the city
const BLOCK = 'pgggsooos'
const NEAR = BLOCK.indexOf('s') + 1, FAR = BLOCK.length // the block's near and far sidewalks, by how far out
// how far the forest and the shrine reach west of the city, and the shrine and the houses north of it, in tiles
const WILD = 20

export type RoomIn = { id: string; title: string; count: number }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
// something you walk right up to and around: it stops you only within r of (x, z), a square like a column's
export type Post = { x: number; z: number; r: number }
export type Prop = { kind: 'tree' | 'oak' | 'lamp' | 'sakura' | 'statue' | 'light'; x: number; z: number; s?: number } // s: scale
export type Layout = {
  // rows[tz - z0][tx - x0]: SOLID tiles, '.' floor, 'L' lobby, 'D' doorway, 'C' column, 'E' elevator shaft,
  // 'B' balcony (floor with a railing on its courtyard side), and under the open sky 'o' street, 's' sidewalk,
  // 'g' grass, 'p' path, 'T' grass with a tree on it
  rows: string[]
  x0: number
  z0: number
  footprint: { x0: number; x1: number; z0: number; z1: number } // the building's outer walls, in tiles (inclusive)
  start: { x: number; z: number } // where a visitor appears when they arrive at the museum
  props: Prop[]
  rooms: { id: string; title: string; sign: Slot; slots: Slot[] }[]
  door?: { x: number; z: number; w: number } // the front door (ground floor), world units
  court?: { x0: number; x1: number; z0: number; z1: number; fountain: { x: number; z: number } }
  // the shrine's hall, the z of its torii and where its lanterns stand; world units
  shrine?: { x: number; z: number; w: number; d: number; gate: number; lanterns: { x: number; z: number }[] }
  // columns, tree trunks, lamp posts, statues...: at most one per tile and wholly inside it, keyed `${tx},${tz}`
  posts: Map<string, Post>
}

// a fixed pseudo-random number in [0, 1) per tile (and salt k), so everyone sees the same forest and city
export const noise = (tx: number, tz: number, k = 0) => {
  const s = Math.sin(tx * 127.1 + tz * 311.7 + k * 74.7) * 43758.5453
  return s - Math.floor(s)
}
// where the trunk of the tree on tile (tx, tz) stands: a bit off center so the forest isn't a grid, never so far
// that two trunks leave too narrow a gap to walk between
export const trunk = (tx: number, tz: number) => ({
  x: (tx + 0.5 + (noise(tx, tz, 1) - 0.5) * 0.3) * TILE,
  z: (tz + 0.5 + (noise(tx, tz, 2) - 0.5) * 0.3) * TILE,
})
// north and south: how deep the deepest room on that side goes
type Options = { ground?: boolean; courtX1?: number; north?: number; south?: number }

// frame on the wall behind floor tile (tx, tz); (nx, nz) is the wall's inward normal
const wallSlot = (tx: number, tz: number, nx: number, nz: number): Slot => ({
  x: (tx + 0.5 - nx / 2) * TILE + nx * 0.03,
  z: (tz + 0.5 - nz / 2) * TILE + nz * 0.03,
  rot: Math.atan2(nx, nz),
})
const prop = (kind: Prop['kind'], tx: number, tz: number): Prop => ({ kind, x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE })
// last column the rooms of a floor use; the courtyard is at least 10 tiles long
const courtEnd = (rooms: number) => Math.max(COURT_X0 + 9, COURT_X0 + Math.ceil(rooms / 2) * (ROOM_W + 1) - 2)
const roomDepth = (r: RoomIn) => Math.max(3, Math.ceil((r.count - ROOM_W) / 2))
// rooms alternate north (even) and south (odd) of the courtyard
const reach = (rooms: RoomIn[], side: number) => Math.max(0, ...rooms.filter((_, i) => i % 2 === side).map(roomDepth))

// all floors share the length of the longest one and the depth of the deepest rooms, so the building is a box
export function buildBuilding(floors: RoomIn[][]): Layout[] {
  const courtX1 = Math.max(...floors.map((rooms) => courtEnd(rooms.length)))
  const north = Math.max(...floors.map((rooms) => reach(rooms, 0))), south = Math.max(...floors.map((rooms) => reach(rooms, 1)))
  return floors.map((rooms, k) => buildFloor(rooms, { ground: k === 0, courtX1, north, south }))
}

export function buildFloor(rooms: RoomIn[], opts: Options = {}): Layout {
  const { ground = false, courtX1 = courtEnd(rooms.length), north = reach(rooms, 0), south = reach(rooms, 1) } = opts
  const depth = rooms.map(roomDepth)
  const end = courtX1 + 3 // last walkable column: the east corridor
  const box = { x0: 0, x1: end + 1, z0: -2 - north, z1: RING_END + 2 + south }
  // the ground floor holds the block too, with the city around it and the forest, shrine and houses past that
  const m = ground ? BLOCK.length + 1 : 0, wild = ground ? WILD : 0
  const x0 = box.x0 - m - wild, z0 = box.z0 - m - wild, z1 = box.z1 + m
  const grid = Array.from({ length: z1 - z0 + 1 }, () => Array<string>(box.x1 + m + 1 - x0).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx - x0] = c }
  const posts = new Map<string, Post>()
  const post = (x: number, z: number, r: number) => posts.set(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`, { x, z, r })
  const fill = (xa: number, xb: number, za: number, zb: number, c: string) => {
    for (let tx = xa; tx <= xb; tx++) for (let tz = za; tz <= zb; tz++) set(tx, tz, c)
  }

  fill(1, end, 0, RING_END, '.')
  fill(1, LOBBY_X1, 0, RING_END, 'L')
  const mx = Math.floor((COURT_X0 + courtX1) / 2), mz = (COURT_Z0 + COURT_Z1 - 1) / 2 // where the paths cross
  if (ground) {
    fill(COURT_X0, courtX1, COURT_Z0, COURT_Z1, 'g')
    fill(COURT_X0, courtX1, mz, mz + 1, 'p')
    fill(mx, mx + 1, COURT_Z0, COURT_Z1, 'p')
    fill(mx, mx + 1, mz, mz + 1, 'F')
  } else fill(COURT_X0, courtX1, COURT_Z0, COURT_Z1, 'v')
  // around the courtyard a column on the corners and every other tile, carrying the arches of an arcade: open on the
  // ground floor, balconies upstairs
  // (the elevator shaft takes its place in the ring first)
  fill(LIFT.tx, LIFT.tx, LIFT.tz0, LIFT.tz1, 'E')
  const ax = LOBBY_X1 + 1, bx = courtX1 + 1, az = COURT_Z0 - 1, bz = COURT_Z1 + 1
  for (let tx = ax; tx <= bx; tx++) {
    for (let tz = az; tz <= bz; tz++) {
      const edgeX = tx === ax || tx === bx, edgeZ = tz === az || tz === bz
      if ((!edgeX && !edgeZ) || grid[tz - z0][tx - x0] === 'E') continue
      const along = edgeX ? tz - az : tx - ax, length = edgeX ? bz - az : bx - ax
      if ((edgeX && edgeZ) || (along % 2 === 0 && along < length - 1)) { // never two side by side
        set(tx, tz, 'C')
        post((tx + 0.5) * TILE, (tz + 0.5) * TILE, COLUMN)
      }
      else if (!ground) set(tx, tz, 'B')
    }
  }
  // how far (tx, tz) is out from the building's outer walls along x and along z, in tiles; 0 or less is inside
  const away = (tx: number, tz: number) => [Math.max(box.x0 - tx, tx - box.x1), Math.max(box.z0 - tz, tz - box.z1)]
  // is (tx, tz) out in front of the door, give or take `spare` rows?
  const byDoor = (tx: number, tz: number, spare = 0) => tx < 0 && tz >= 6 - spare && tz <= 7 + spare
  if (ground) {
    fill(2, 2, 2, 4, 'R') // reception desk, on your left as you come in
    fill(0, 0, 6, 7, 'D') // double front door
    for (let tx = x0 + 1; tx < box.x1 + m; tx++) {
      for (let tz = z0 + 1; tz < z1; tz++) {
        const d = Math.max(...away(tx, tz)), c = BLOCK[d - 1], w = box.x0 - tx, n = box.z0 - tz // how far west and north
        if (w >= FAR && n >= NEAR && n <= FAR) set(tx, tz, BLOCK[n - 1]) // the street north of the block runs on west
        else if (d > 0 && d <= FAR) set(tx, tz, c === 'g' && byDoor(tx, tz) ? 'p' : c) // a walk through the garden to the door
        // the forest, thick along the map's edge
        else if (w > FAR && n < NEAR) set(tx, tz, Math.min(tx - x0, z1 - tz) <= 2 || noise(tx, tz) < 0.4 ? 'T' : 'g')
        else if (n > FAR && w <= FAR) set(tx, tz, tx % 3 && tz % 3 ? '#' : 's') // houses two tiles square, alleys between
        // the shrine grounds are laid out below; past the east and south sidewalks, the city
      }
    }
  }

  const out = rooms.map((r, i) => {
    const d = depth[i]
    const dir = i % 2 ? 1 : -1 // from the corridor into the room
    const rx = COURT_X0 + (i >> 1) * (ROOM_W + 1)
    const doorX = rx + (ROOM_W >> 1), doorZ = dir < 0 ? -1 : RING_END + 1, far = doorZ + dir * d
    for (let tx = rx; tx < rx + ROOM_W; tx++) for (let k = 1; k <= d; k++) set(tx, doorZ + dir * k, '.')
    set(doorX, doorZ, 'D')

    // back wall first, then both side walls from the back toward the door
    const slots: Slot[] = []
    for (let tx = rx; tx < rx + ROOM_W; tx++) slots.push(wallSlot(tx, far, 0, -dir))
    for (let k = 0; k < d; k++) slots.push(wallSlot(rx, far - dir * k, 1, 0), wallSlot(rx + ROOM_W - 1, far - dir * k, -1, 0))

    // sign on the corridor side of the door lintel
    const sign = { x: (doorX + 0.5) * TILE, z: (doorZ + 0.5 - dir / 2) * TILE - dir * 0.03, rot: dir < 0 ? 0 : Math.PI }
    return { id: r.id, title: r.title, sign, slots: slots.slice(0, r.count) }
  })

  if (!ground) return { rows: grid.map((r) => r.join('')), x0, z0, footprint: box, start: SPAWN, props: [], rooms: out, posts }

  // the shrine grounds, in the corner between the forest and the houses: a clearing in the trees, and down its
  // middle a path two tiles wide from the street, through the torii, up to the hall
  const sx = x0 + 1, sz = z0 + 1, px = sx + WILD / 2 - 1
  for (let i = 0; i < WILD; i++) {
    for (let j = 0; j < WILD; j++) {
      const clearing = i >= 6 && i < WILD - 6 && j >= 2, edge = i < 2 || j < 2 || i >= WILD - 2
      set(sx + i, sz + j, edge || (!clearing && noise(sx + i, sz + j) < 0.15) ? 'T' : 'g')
    }
  }
  fill(px, px + 1, sz + 6, sz + WILD - 1, 'p')
  fill(px - 1, px + 2, sz + 4, sz + 5, 'H')

  // lamps flanking the door and lights at the garden gate; trees around the garden with a statue on each corner,
  // lamps along the sidewalk, cherry trees along both long sides of the courtyard and beside the shrine, and two
  // statues guarding its path
  const mid = (c: string) => (BLOCK.indexOf(c) + BLOCK.lastIndexOf(c)) / 2 + 1 // how far out a band's middle is
  const garden = mid('g'), gate = BLOCK.lastIndexOf('g') + 1
  const props = [prop('lamp', -1, 5), prop('lamp', -1, 8), prop('light', -gate, 5), prop('light', -gate, 8)]
  for (let tx = x0; tx <= box.x1 + m; tx++) {
    for (let tz = z0; tz <= z1; tz++) {
      const [dx, dz] = away(tx, tz), d = Math.max(dx, dz), n = (((tx + tz) % 12) + 12) % 12
      if (dx === garden && dz === garden) props.push(prop('statue', tx, tz))
      else if (!byDoor(tx, tz, 2) && d === garden && n % 3 === 0) set(tx, tz, 'T')
      else if (!byDoor(tx, tz, 2) && d === NEAR && n % 4 === 0) props.push(prop('lamp', tx, tz))
      // a tree on every tree tile, of either kind, some bigger than others
      if (grid[tz - z0][tx - x0] === 'T') {
        props.push({ kind: noise(tx, tz, 3) < 0.5 ? 'tree' : 'oak', ...trunk(tx, tz), s: 0.8 + noise(tx, tz, 4) * 0.5 })
      }
    }
  }
  for (let tx = COURT_X0 + 1; tx < courtX1; tx += 3) {
    if (tx < mx - 1 || tx > mx + 2) props.push(prop('sakura', tx, COURT_Z0 + 1), prop('sakura', tx, COURT_Z1 - 1))
  }
  for (const tz of [sz + 3, sz + 7]) props.push(prop('sakura', px - 3, tz), prop('sakura', px + 4, tz))
  props.push(prop('statue', px - 1, sz + 7), prop('statue', px + 2, sz + 7))
  for (const p of props) post(p.x, p.z, BODY[p.kind])
  // the torii two tiles in from the street, and pairs of lanterns every three tiles from there to near the hall
  const cx = (px + 1) * TILE, gateZ = (sz + WILD - 1.5) * TILE, lanterns: { x: number; z: number }[] = []
  for (const s of [-1, 1]) {
    post(cx + s * TORII, gateZ, PILLAR)
    for (let j = WILD - 3.5; j > 7.5; j -= 3) lanterns.push({ x: cx + s * 2.6, z: (sz + j) * TILE })
  }
  for (const l of lanterns) post(l.x, l.z, LANTERN)
  return {
    rows: grid.map((r) => r.join('')), x0, z0, footprint: box, props, rooms: out, posts,
    start: { x: (box.x0 - mid('o') + 0.5) * TILE, z: 7 * TILE }, // in the middle of the street, facing the door
    door: { x: 0.5 * TILE, z: 7 * TILE, w: 2 * TILE },
    court: {
      x0: COURT_X0 * TILE, x1: (courtX1 + 1) * TILE, z0: COURT_Z0 * TILE, z1: (COURT_Z1 + 1) * TILE,
      fountain: { x: (mx + 1) * TILE, z: (mz + 1) * TILE },
    },
    shrine: { x: cx, z: (sz + 5) * TILE, w: 4 * TILE, d: 2 * TILE, gate: gateZ, lanterns },
  }
}

export const tileAt = (l: Layout | undefined, x: number, z: number) =>
  l?.rows[Math.floor(z / TILE) - l.z0]?.[Math.floor(x / TILE) - l.x0] ?? '#'

// does something stop you at (x, z)? whole tiles for SOLID ones, only the post on a tile that has one (a column, a
// trunk...) so you can walk right up to it; the elevator shaft is up to whoever drives the car
export function solidAt(l: Layout | undefined, x: number, z: number) {
  const p = l?.posts.get(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`)
  if (p) return Math.abs(x - p.x) < p.r && Math.abs(z - p.z) < p.r
  return SOLID.includes(tileAt(l, x, z))
}

// is (x, z) in the lobby right in front of the elevator?
export const atLiftDoor = (x: number, z: number) =>
  Math.floor(x / TILE) === LIFT.tx - 1 && Math.floor(z / TILE) >= LIFT.tz0 && Math.floor(z / TILE) <= LIFT.tz1
