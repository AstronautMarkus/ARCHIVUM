// Turns the museum into tile maps, one per floor; floors stack WALL_H apart. Tile (tx, tz) covers
// world [tx*TILE, (tx+1)*TILE). Every floor is a school-like ring: a lobby at the west end, corridors along the
// north and south sides of a central courtyard, and the rooms outside the corridors.
// The building is the same box on every floor and stands in the middle of its city block with the core in front of
// it, a one-storey gallery of famous paintings that never changes; on the ground floor a garden behind a hedge, a
// sidewalk and a street go all the way around both, with the city beyond. You come in from the street through the
// entrance tower and the core to the lobby, which has the reception desk, and the courtyard has grass, paths, a
// fountain and cherry trees. Upper floors look down into it from balconies, and out through real windows at both ends.
// Past the city to the west there's a forest, to the north a neighbourhood of houses along alleys, and in the
// corner between them a little shrine; the street on the block's north side runs on west between shrine and forest.
// Two glass elevators ride up and down the courtyard's west edge, their doors opening onto the lobby of each floor.
// Rooms have a fixed width and grow in depth with their exhibits, so new content never moves existing rooms;
// more rooms only make the building (and its courtyard) longer, the same for every floor, and push the block out.
export const TILE = 2
export const WALL_H = 3.5 // also one storey: floors stack with no gap
export const DOOR_H = 2.2
export const SPAWN = { x: 2.5 * TILE, z: 1.5 * TILE } // a safe spot in the lobby, on every floor
// wall, fountain, reception desk, courtyard void, 'H' a block drawn by its own component (the shrine's hall, the
// entrance's piers), hedge; posts, the elevator and the core's slanted walls are special
export const SOLID = '#FRvHh'
export const MAX_FLOORS = 99
export const COLUMN = 0.35 // half the width of a column
export const TORII = 2.3 // how far each pillar of the shrine's torii stands from the middle of its path
// what stops you around each prop, as half the width of its trunk, post or base
const BODY = { tree: COLUMN, oak: COLUMN, sakura: 0.25, statue: 0.45, lamp: 0.2, light: 0.25 }
const LANTERN = 0.3, PILLAR = 0.25, FLAGPOLE = 0.15 // the shrine's stone lanterns, the torii's pillars, flagpoles
// the entrance's porch is this many tiles deep; its two columns stand this far in from its front, this thick
const PORCH = 2, PORTICO = 0.8, SHAFT = 0.4
// The core, drawn after a real museum's plan: a north wing with its corner cut, a waist where the entrance tower
// stands between two slanted walls, a room south-west and one east. Columns CORE_X0..-1 (the building's west wall is
// its east wall), rows CORE_Z0 on, always inside the building's rows. '*' is a wall with a frame on each side that
// faces floor, hung from core.json in reading order; '\' and '/' are walls from corner to corner of their tile, solid
// on its west half; 'H' and 'p' the tower's piers and porch, 'g' garden. It never grows.
export const CORE = [
  '##*#*#*#*##ggg',
  '#.........#ggg',
  '*.........*ggg',
  '#.........#ggg',
  'g\\........#ggg',
  'gg\\.......*ggg',
  'HH#.......#ggg',
  'pp#....##*##*#',
  'ppD....D......',
  'ppD....D......',
  'pp#....#......',
  'HH#....*......',
  'gg/....#......',
  'g/.....#......',
  '#......D......',
  '*......D......',
  '#......#......',
  '##*##*###*##*#',
]
export const CORE_X0 = -CORE[0].length, CORE_Z0 = -2
// the elevator shafts: two tiles wide each on the courtyard's west edge, one either side of the entrance axis (rows
// 6-7) so walking in from the street you see straight into the courtyard between them; their doors face the lobby.
// z: center, w: width along z, door: width of the opening, which leaves room on both sides for the open doors to
// slide away
export const LIFTS = [4, 8].map((tz0) => ({ tx: 6, tz0, tz1: tz0 + 1, x0: 6 * TILE, z: (tz0 + 1) * TILE, w: 2 * TILE, door: 1.6 }))
const ROOM_W = 5
// rows of the ring: corridor 0-1, arcade 2, courtyard 3-10, arcade 11, corridor 12-13
const RING_END = 13, COURT_Z0 = 3, COURT_Z1 = 10, LOBBY_X1 = 5, COURT_X0 = 7
// the block around the building, by distance from its outer walls in tiles: a stone walk, the garden, the
// sidewalk, the street and the far sidewalk; past that, the city
const BLOCK = 'pgggsooos'
const NEAR = BLOCK.indexOf('s') + 1, FAR = BLOCK.length // the block's near and far sidewalks, by how far out
const HEDGE = BLOCK.lastIndexOf('g') + 1 // the garden's outer edge, where its hedge and gate are
// how far the forest and the shrine reach west of the city, and the shrine and the houses north of it, in tiles
const WILD = 20

export type RoomIn = { id: string; title: string; count: number; locked?: boolean }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
// something you walk right up to and around: it stops you only within r of (x, z), a square like a column's
export type Post = { x: number; z: number; r: number }
export type Prop = { kind: 'tree' | 'oak' | 'lamp' | 'sakura' | 'statue' | 'light'; x: number; z: number; s?: number } // s: scale
export type Layout = {
  // rows[tz - z0][tx - x0]: SOLID tiles, '.' floor, 'L' lobby, 'D' doorway, 'C' column, 'E' elevator shaft,
  // 'B' balcony (floor with a railing on its courtyard side), 'W' a window you step into, glazed on its outer side,
  // '\' and '/' the core's slanted walls (see CORE), and
  // under the open sky 'o' street, 's' sidewalk, 'g' grass, 'p' path, 'T' grass with a tree on it
  rows: string[]
  x0: number
  z0: number
  footprint: { x0: number; x1: number; z0: number; z1: number } // the building's outer walls, in tiles (inclusive)
  start: { x: number; z: number } // where a visitor appears when they arrive at the museum
  props: Prop[]
  // a locked room has a PIN door in its doorway (tile `door`, which the room is `dir` away from: -1 north, 1 south),
  // a keypad beside it in the corridor and an exit button beside it inside
  rooms: { id: string; title: string; sign: Slot; slots: Slot[]; locked: boolean; dir: number; door: { tx: number; tz: number } }[]
  door?: { x: number; z: number; w: number } // the front door (ground floor), world units
  // the entrance tower around the door: its front x, center z, width and the porch's depth, its two columns and the
  // flagpoles out in the garden; world units
  entrance?: { x: number; z: number; w: number; d: number; columns: { x: number; z: number }[]; flags: { x: number; z: number }[] }
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
// where the core's paintings hang: its '*' walls in reading order, and on each the sides facing north, west, east, south
export const CORE_ART: Slot[] = CORE.flatMap((row, i) => [...row].flatMap((c, j) => (c !== '*' ? [] : [[0, -1], [-1, 0], [1, 0], [0, 1]]
  .filter(([a, b]) => CORE[i + b]?.[j + a] === '.').map(([a, b]) => wallSlot(CORE_X0 + j + a, CORE_Z0 + i + b, a, b)))))
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
  // the ground floor holds the core in front of the building, and the block around both, with the city around it
  // and the forest, shrine and houses past that
  const site = ground ? { ...box, x0: CORE_X0 } : box
  const m = ground ? BLOCK.length + 1 : 0, wild = ground ? WILD : 0
  const x0 = site.x0 - m - wild, z0 = site.z0 - m - wild, z1 = site.z1 + m
  const grid = Array.from({ length: z1 - z0 + 1 }, () => Array<string>(site.x1 + m + 1 - x0).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx - x0] = c }
  const posts = new Map<string, Post>()
  // a post goes on every tile it reaches into, so solidAt only ever has to look at the tile you're on
  const post = (x: number, z: number, r: number) => {
    const p = { x, z, r }, t = (v: number) => Math.floor(v / TILE)
    for (let tx = t(x - r); tx <= t(x + r); tx++) for (let tz = t(z - r); tz <= t(z + r); tz++) posts.set(`${tx},${tz}`, p)
  }
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
  // around the courtyard, with no columns: an open ring on the ground floor, balconies upstairs
  // (the elevator shafts take their places in the ring first)
  for (const s of LIFTS) fill(s.tx, s.tx, s.tz0, s.tz1, 'E')
  const ax = LOBBY_X1 + 1, bx = courtX1 + 1, az = COURT_Z0 - 1, bz = COURT_Z1 + 1
  for (let tx = ax; tx <= bx; tx++) {
    for (let tz = az; tz <= bz; tz++) {
      const edge = tx === ax || tx === bx || tz === az || tz === bz
      if (edge && !ground && grid[tz - z0][tx - x0] !== 'E') set(tx, tz, 'B')
    }
  }
  // how far (tx, tz) is out from the outer walls of the building (and the core) along x and along z, in tiles; 0 or
  // less is inside
  const away = (tx: number, tz: number) => [Math.max(site.x0 - tx, tx - site.x1), Math.max(site.z0 - tz, tz - site.z1)]
  // is (tx, tz) out in front of the door, give or take `spare` rows?
  const byDoor = (tx: number, tz: number, spare = 0) => tx < 0 && tz >= 6 - spare && tz <= 7 + spare
  if (ground) {
    fill(2, 2, 2, 4, 'R') // reception desk, on your left as you come in
    fill(0, 0, 6, 7, 'D') // double door from the core
    for (let tx = x0 + 1; tx < site.x1 + m; tx++) {
      for (let tz = z0 + 1; tz < z1; tz++) {
        const d = Math.max(...away(tx, tz)), c = BLOCK[d - 1], w = site.x0 - tx, n = site.z0 - tz // how far west and north
        if (w >= FAR && n >= NEAR && n <= FAR) set(tx, tz, BLOCK[n - 1]) // the street north of the block runs on west
        // a walk through the garden to the door, and a hedge around the garden, open at the gate
        else if (d > 0 && d <= FAR) set(tx, tz, c !== 'g' ? c : byDoor(tx, tz) ? 'p' : d === HEDGE && !byDoor(tx, tz, 1) ? 'h' : c)
        // the forest, thick along the map's edge
        else if (w > FAR && n < NEAR) set(tx, tz, Math.min(tx - x0, z1 - tz) <= 2 || noise(tx, tz) < 0.4 ? 'T' : 'g')
        else if (n > FAR && w <= FAR) set(tx, tz, tx % 3 && tz % 3 ? '#' : 's') // houses two tiles square, alleys between
        // the shrine grounds are laid out below; past the east and south sidewalks, the city
      }
    }
    // the core, in a garden where it leaves room; the entrance tower's roof is held up by two columns, one either
    // side of the front door
    fill(CORE_X0, -1, site.z0, site.z1, 'g')
    CORE.forEach((row, i) => [...row].forEach((c, j) => set(CORE_X0 + j, CORE_Z0 + i, c === '*' ? '#' : c)))
    for (const tz of [6, 8]) post(CORE_X0 * TILE + PORTICO, tz * TILE, SHAFT)
  }
  // real windows in the outer walls of the lobby and the east corridor, every other tile, wherever there's open air
  // outside (downstairs the core stands against most of the lobby): a bay you step into to look out. Upstairs the
  // glass is the edge of the map; downstairs a hedge outside it keeps you from walking through
  for (const [tx, out] of [[box.x0, -1], [box.x1, 1]]) {
    for (let tz = 0; tz <= RING_END; tz++) {
      if (!((tx + tz) & 1) || (ground && !'gpT'.includes(grid[tz - z0][tx + out - x0]))) continue
      set(tx, tz, 'W')
      if (ground) set(tx + out, tz, 'h')
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
    return { id: r.id, title: r.title, sign, slots: slots.slice(0, r.count), locked: !!r.locked, dir, door: { tx: doorX, tz: doorZ } }
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

  // lights at the garden gate; trees around the garden with a statue on each corner,
  // lamps along the sidewalk, cherry trees along both long sides of the courtyard, beside the shrine and in the
  // core's garden, two statues guarding the shrine's path and two more in the core's rooms
  const mid = (c: string) => (BLOCK.indexOf(c) + BLOCK.lastIndexOf(c)) / 2 + 1 // how far out a band's middle is
  const garden = mid('g')
  const props = [prop('light', site.x0 - HEDGE, 5), prop('light', site.x0 - HEDGE, 8)]
  props.push(prop('sakura', -2, 1), prop('statue', -9, 1), prop('statue', -4, 10))
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
  // a flagpole either side of the walk, halfway across the garden
  const flags = [4, 9].map((tz) => ({ x: (site.x0 - garden + 0.5) * TILE, z: (tz + 0.5) * TILE }))
  for (const f of flags) post(f.x, f.z, FLAGPOLE)
  return {
    rows: grid.map((r) => r.join('')), x0, z0, footprint: box, props, rooms: out, posts,
    start: { x: (site.x0 - mid('o') + 0.5) * TILE, z: 7 * TILE }, // in the middle of the street, facing the door
    door: { x: (CORE_X0 + PORCH + 0.5) * TILE, z: 7 * TILE, w: 2 * TILE },
    entrance: {
      x: CORE_X0 * TILE, z: 7 * TILE, w: 6 * TILE, d: PORCH * TILE, flags,
      columns: [6, 8].map((tz) => ({ x: CORE_X0 * TILE + PORTICO, z: tz * TILE })),
    },
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
// trunk...) so you can walk right up to it, the west half of a slanted wall's tile; the elevator shaft is up to
// whoever drives the car
export function solidAt(l: Layout | undefined, x: number, z: number) {
  const p = l?.posts.get(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`)
  if (p) return Math.abs(x - p.x) < p.r && Math.abs(z - p.z) < p.r
  const c = tileAt(l, x, z), u = x / TILE - Math.floor(x / TILE), v = z / TILE - Math.floor(z / TILE)
  if (c === '\\') return u < v
  if (c === '/') return u + v < 1
  return SOLID.includes(c)
}

// which elevator's shaft (x, z) is in, and which one's doors it's right in front of in the lobby; -1 for none
const liftAt = (tx: number, x: number, z: number) => Math.floor(x / TILE) !== tx ? -1
  : LIFTS.findIndex((s) => Math.floor(z / TILE) >= s.tz0 && Math.floor(z / TILE) <= s.tz1)
export const liftShaft = (x: number, z: number) => liftAt(LIFTS[0].tx, x, z)
export const liftDoor = (x: number, z: number) => liftAt(LIFTS[0].tx - 1, x, z)
