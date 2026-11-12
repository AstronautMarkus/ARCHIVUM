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
// entrance's piers), hedge, and the empty sky off the island's edge; posts, the elevator and the core's slanted
// walls are special
export const SOLID = '#FRvHh '
export const OUTDOOR = 'osgpT' // tiles under the open sky
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
// the keep: the castle's tall tower, against the middle of the building's east wall on the entrance axis, across
// rows KEEP.tz0..tz1 and KEEP.d tiles out into the garden. It rises to keepLevel storeys, always well over the roof,
// where its top room, a tile wider all round, is ARCHIVUM's secret office. A doorway from the east corridor leads
// into a hall at its foot, and from there an elevator in a glass shaft up its back goes straight to the top
export const KEEP = { tz0: 5, tz1: 8, d: 3 }
export const keepLevel = (floors: number) => Math.max(floors + 6, 12)
// the keep's elevator, in its last column, its doors on the hall at the bottom and on the office's lobby at the top
export const keepLift = (l: Layout) => {
  const tx = l.footprint.x1 + KEEP.d, tz0 = KEEP.tz0 + 1, tz1 = KEEP.tz1 - 1
  return { tx, tz0, tz1, x0: tx * TILE, z: ((tz0 + tz1 + 1) / 2) * TILE, w: (tz1 - tz0 + 1) * TILE, door: 1.6 }
}
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
// The whole map is a floating island: a disc around the rectangle of all of the above, RIM tiles wider than its
// corners, with a stone wall round its edge, a strip of grass inside the wall and nothing outside it. Past the far
// sidewalk the town goes on to that strip, and the forest west: north, houses on lots two tiles square with an
// alley one tile wide between them; east and south, blocks of flats on lots five tiles square, streets two wide
const RIM = 3
export const LOT = { house: 2, block: 5 }
const STREET = { house: 1, block: 2 }

export type RoomIn = { id: string; title: string; count: number; locked?: boolean }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
// something you walk right up to and around: it stops you only within r of (x, z), a square like a column's
export type Post = { x: number; z: number; r: number }
export type Prop = { kind: 'tree' | 'oak' | 'lamp' | 'sakura' | 'statue' | 'light'; x: number; z: number; s?: number } // s: scale
export type Rect = [number, number, number, number] // center x, center z, size x, size z; world units
export type Lot = { x0: number; z0: number; kind: keyof typeof LOT }
type Box = { x0: number; x1: number; z0: number; z1: number }
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
  // area: the room's floor, in tiles (inclusive)
  rooms: { id: string; title: string; sign: Slot; slots: Slot[]; locked: boolean; dir: number; door: { tx: number; tz: number }; area: Box }[]
  door?: { x: number; z: number; w: number } // the front door (ground floor), world units
  // the entrance tower around the door: its front x, center z, width and the porch's depth, its two columns and the
  // flagpoles out in the garden; world units
  entrance?: { x: number; z: number; w: number; d: number; columns: { x: number; z: number }[]; flags: { x: number; z: number }[] }
  court?: { x0: number; x1: number; z0: number; z1: number; fountain: { x: number; z: number } }
  // the island the ground floor stands on: its middle and the radius of the wall round its edge; world units
  island?: { x: number; z: number; r: number }
  // the town's building lots, each a square of solid tiles x0..x0+size-1, z0..; their buildings are drawn by City
  lots?: Lot[]
  // the shrine's hall, the z of its torii and where its lanterns stand; world units
  shrine?: { x: number; z: number; w: number; d: number; gate: number; lanterns: { x: number; z: number }[] }
  // the keep's west face x, center z, width along z and depth along x; and the round towers on the building's
  // corners, by their centers; world units
  keep?: { x: number; z: number; w: number; d: number }
  turrets?: { x: number; z: number }[]
  // thin walls and furniture that stop you, by center and size: [x, z, size x, size z]; and the office's door, in a
  // wall across x (the keep's top room); world units
  walls?: Rect[]
  // ...and where its furniture stands, all of it in `walls` too: the long table, the chairs round it (`back`: which
  // way along x or z each one's back is), the bookcases on the lobby's outer walls, a desk and a globe
  office?: { x: number; z: number; w: number; table: Rect; chairs: { x: number; z: number; back: [number, number] }[]; shelves: Rect[]; desk: Rect; globe: Rect }
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
  const x0 = site.x0 - m - wild, z0 = site.z0 - m - wild, x1 = site.x1 + m, z1 = site.z1 + m // the map's rectangle
  // downstairs, the island round it (see RIM): its middle and its wall's radius, in tiles; the grid is its square
  const island = { x: (x0 + x1 + 1) / 2, z: (z0 + z1 + 1) / 2, r: Math.hypot(x1 + 1 - x0, z1 + 1 - z0) / 2 + RIM }
  const [gx0, gz0, gx1, gz1] = !ground ? [x0, z0, x1, z1]
    : [Math.floor(island.x - island.r) - 1, Math.floor(island.z - island.r) - 1, Math.ceil(island.x + island.r), Math.ceil(island.z + island.r)]
  const grid = Array.from({ length: gz1 - gz0 + 1 }, () => Array<string>(gx1 - gx0 + 1).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - gz0][tx - gx0] = c }
  const get = (tx: number, tz: number) => grid[tz - gz0][tx - gx0]
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
      if (edge && !ground && get(tx, tz) !== 'E') set(tx, tz, 'B')
    }
  }
  // how far (tx, tz) is out from the outer walls of the building (and the core) along x and along z, in tiles; 0 or
  // less is inside
  const away = (tx: number, tz: number) => [Math.max(site.x0 - tx, tx - site.x1), Math.max(site.z0 - tz, tz - site.z1)]
  // is (tx, tz) out in front of the door, give or take `spare` rows?
  const byDoor = (tx: number, tz: number, spare = 0) => tx < 0 && tz >= 6 - spare && tz <= 7 + spare
  const turrets = [box.x0, box.x1 + 1].flatMap((tx) => [box.z0, box.z1 + 1].map((tz) => ({ x: tx * TILE, z: tz * TILE })))
  const zone = new Map<string, Lot['kind']>(), lots: Lot[] = [] // the town's tiles by kind of lot, then its lots
  const mod = (v: number, k: number) => ((v % k) + k) % k
  if (ground) {
    fill(2, 2, 2, 4, 'R') // reception desk, on your left as you come in
    fill(0, 0, 6, 7, 'D') // double door from the core
    for (let tx = gx0; tx <= gx1; tx++) {
      for (let tz = gz0; tz <= gz1; tz++) {
        const d = Math.max(...away(tx, tz)), c = BLOCK[d - 1], w = site.x0 - tx, n = site.z0 - tz // how far west and north
        const edge = island.r - Math.hypot(tx + 0.5 - island.x, tz + 0.5 - island.z) // how far in from the wall
        if (edge < 0) set(tx, tz, ' ') // off the island
        else if (edge < RIM - 0.5) set(tx, tz, 'g') // the grass inside the wall
        else if (w >= FAR && n >= NEAR && n <= FAR) set(tx, tz, BLOCK[n - 1]) // the street north of the block runs on west
        // a walk through the garden to the door, and a hedge around the garden, open at the gate
        else if (d > 0 && d <= FAR) set(tx, tz, c !== 'g' ? c : byDoor(tx, tz) ? 'p' : d === HEDGE && !byDoor(tx, tz, 1) ? 'h' : c)
        // the forest, thick along the wall
        else if (w > FAR) set(tx, tz, edge < RIM + 2.5 || noise(tx, tz) < 0.4 ? 'T' : 'g')
        else if (d > FAR) { // the town (see LOT), its lots counted out from the far sidewalk, so the first row fronts it
          const kind = n > FAR ? 'house' : 'block', k = LOT[kind] + STREET[kind], lot = (v: number) => mod(v, k) < LOT[kind]
          const east = tx > site.x1 + FAR, [ex, ez] = kind === 'house' ? [tx - (site.x0 - FAR), site.z0 - FAR - 1 - tz]
            : east ? [tx - (site.x1 + FAR + 1), tz - (site.z0 - FAR)] : [tx - (site.x0 - FAR), tz - (site.z1 + FAR + 1)]
          zone.set(`${tx},${tz}`, kind)
          set(tx, tz, lot(ex) && lot(ez) ? '#' : 's')
        }
        // the shrine grounds are laid out below, over the forest
      }
    }
    // a lot is built on only if the island has room for all of it; the rest of a cut one is garden. A lot starts
    // where its kind's solid tiles do, along x and along z
    const solid = (tx: number, tz: number, kind: Lot['kind']) => get(tx, tz) === '#' && zone.get(`${tx},${tz}`) === kind
    for (let tx = gx0; tx <= gx1; tx++) {
      for (let tz = gz0; tz <= gz1; tz++) {
        const kind = zone.get(`${tx},${tz}`), size = kind && LOT[kind]
        if (!kind || !size || !solid(tx, tz, kind) || solid(tx - 1, tz, kind) || solid(tx, tz - 1, kind)) continue
        const tiles = Array.from({ length: size * size }, (_, i) => [tx + (i % size), tz + Math.floor(i / size)])
        if (tiles.every(([a, b]) => get(a, b) === '#' && zone.get(`${a},${b}`) === kind)) {
          lots.push({ x0: tx, z0: tz, kind })
          for (const [a, b] of tiles) zone.delete(`${a},${b}`)
        }
      }
    }
    for (const [key] of zone) {
      const [tx, tz] = key.split(',').map(Number)
      if (get(tx, tz) === '#') set(tx, tz, 'g')
    }
    // the core, in a garden where it leaves room; the entrance tower's roof is held up by two columns, one either
    // side of the front door
    fill(CORE_X0, -1, site.z0, site.z1, 'g')
    CORE.forEach((row, i) => [...row].forEach((c, j) => set(CORE_X0 + j, CORE_Z0 + i, c === '*' ? '#' : c)))
    for (const tz of [6, 8]) post(CORE_X0 * TILE + PORTICO, tz * TILE, SHAFT)
    // the castle: a round tower on each corner of the building, standing half out in the garden (but never in the
    // core's, which doesn't change), and the keep against the middle of its east wall
    const core = (tx: number, tz: number) => tx >= CORE_X0 && tx < 0 && tz >= CORE_Z0 && tz < CORE_Z0 + CORE.length
    for (const { x, z } of turrets) {
      for (const tx of [x / TILE - 1, x / TILE]) {
        for (const tz of [z / TILE - 1, z / TILE]) if (!core(tx, tz) && 'pgT'.includes(get(tx, tz))) set(tx, tz, 'H')
      }
    }
    // the keep: solid but for a hall at its foot, its elevator's shaft behind that, and a doorway from the corridor
    fill(box.x1 + 1, box.x1 + KEEP.d, KEEP.tz0, KEEP.tz1, 'H')
    fill(box.x1 + 1, box.x1 + KEEP.d - 1, KEEP.tz0 + 1, KEEP.tz1 - 1, '.')
    fill(box.x1 + KEEP.d, box.x1 + KEEP.d, KEEP.tz0 + 1, KEEP.tz1 - 1, 'E')
  }
  // real windows in the outer walls of the lobby and the east corridor, every other tile, wherever there's open air
  // outside (downstairs the core stands against most of the lobby, and the keep against the east corridor's
  // middle all the way up): a bay you step into to look out. Upstairs the glass is the edge of the map; downstairs
  // a hedge outside it keeps you from walking through
  for (const [tx, out] of [[box.x0, -1], [box.x1, 1]]) {
    for (let tz = 0; tz <= RING_END; tz++) {
      if (!((tx + tz) & 1) || (out > 0 && tz >= KEEP.tz0 && tz <= KEEP.tz1)) continue
      if (ground && !'gpT'.includes(get(tx + out, tz))) continue
      set(tx, tz, 'W')
      if (ground) set(tx + out, tz, 'h')
    }
  }

  if (ground) fill(box.x1, box.x1, KEEP.tz0 + 1, KEEP.tz1 - 1, 'D') // through the east wall into the keep's hall

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
    const area = { x0: rx, x1: rx + ROOM_W - 1, z0: Math.min(doorZ + dir, far), z1: Math.max(doorZ + dir, far) }
    return { id: r.id, title: r.title, sign, slots: slots.slice(0, r.count), locked: !!r.locked, dir, door: { tx: doorX, tz: doorZ }, area }
  })

  if (!ground) return { rows: grid.map((r) => r.join('')), x0: gx0, z0: gz0, footprint: box, start: SPAWN, props: [], rooms: out, posts }

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
  for (let tx = gx0; tx <= gx1; tx++) {
    for (let tz = gz0; tz <= gz1; tz++) {
      const [dx, dz] = away(tx, tz), d = Math.max(dx, dz), n = (((tx + tz) % 12) + 12) % 12
      if (dx === garden && dz === garden) props.push(prop('statue', tx, tz))
      else if (!byDoor(tx, tz, 2) && d === garden && n % 3 === 0 && get(tx, tz) === 'g') set(tx, tz, 'T')
      else if (!byDoor(tx, tz, 2) && d === NEAR && n % 4 === 0) props.push(prop('lamp', tx, tz))
      // a tree on every tree tile, of either kind, some bigger than others
      if (get(tx, tz) === 'T') {
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
    rows: grid.map((r) => r.join('')), x0: gx0, z0: gz0, footprint: box, props, rooms: out, posts,
    island: { x: island.x * TILE, z: island.z * TILE, r: island.r * TILE }, lots,
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
    keep: { x: (box.x1 + 1) * TILE, z: ((KEEP.tz0 + KEEP.tz1 + 1) / 2) * TILE, w: (KEEP.tz1 - KEEP.tz0 + 1) * TILE, d: KEEP.d * TILE },
    turrets,
  }
}

// The keep's top room, the secret office, as a level of its own. It spans the keep a tile wider all round. The
// elevator comes up in the middle of its east side into a lobby walled off from the rest, which you go into
// through the office's door (`office`) in the lobby's west wall, facing the long table
export function buildTop(ground: Layout): Layout {
  const f = ground.footprint, lift = keepLift(ground)
  const x0 = f.x1 - 1, z0 = KEEP.tz0 - 2, xa = f.x1, xb = f.x1 + KEEP.d + 1 // the room: columns xa..xb
  const grid = Array.from({ length: KEEP.tz1 - KEEP.tz0 + 5 }, () => Array<string>(KEEP.d + 4).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx - x0] = c }
  for (let tx = xa; tx <= xb; tx++) for (let tz = KEEP.tz0 - 1; tz <= KEEP.tz1 + 1; tz++) set(tx, tz, '.')
  for (let tz = lift.tz0; tz <= lift.tz1; tz++) { set(lift.tx, tz, 'E'); set(xb, tz, '#') } // the shaft, the machinery behind it
  const lx = lift.x0 - TILE, [n, s] = [lift.z - lift.w / 2, lift.z + lift.w / 2], door = 1.4, jamb = (lift.w - door) / 2
  const [tx, tz] = [(xa + 1) * TILE, lift.z], table: Rect = [tx, tz, TABLE.w, TABLE.l]
  // five chairs down each side, one at each end, their backs away from the table
  const chairs = [-1, 1].flatMap((e) => [
    ...Array.from({ length: 5 }, (_, i) => ({ x: tx + e * (TABLE.w / 2 + 0.3), z: tz - 2.4 + i * 1.2, back: [e, 0] as [number, number] })),
    { x: tx, z: tz + e * (TABLE.l / 2 + 0.35), back: [0, e] as [number, number] },
  ])
  const back = (xb + 1) * TILE, shelf = (z: number): Rect => [(lx + back) / 2, z, back - lx - 0.6, 0.4]
  const shelves = [shelf(n - 0.3), shelf(s + 0.3)], desk: Rect = [back - 0.9, n - 2.2, 0.8, 1.8], globe: Rect = [back - 1.2, s + 2.2, 0.5, 0.5]
  return {
    rows: grid.map((r) => r.join('')), x0, z0, footprint: f, start: { x: lx + TILE / 2, z: lift.z }, props: [], rooms: [], posts: new Map(),
    walls: [
      [lx + TILE / 2, n, TILE, 0.2], [lx + TILE / 2, s, TILE, 0.2], // the lobby's sides
      [lx, n + jamb / 2, 0.2, jamb], [lx, s - jamb / 2, 0.2, jamb], // its west wall, either side of the door
      table, ...shelves, desk, globe, ...chairs.map((c): Rect => [c.x, c.z, 0.5, 0.5]),
    ],
    office: { x: lx, z: lift.z, w: door, table, chairs, shelves, desk, globe },
  }
}
export const TABLE = { w: 1.3, l: 6, h: 0.78 } // the office's long table: across x, along z, and its height

export const tileAt = (l: Layout | undefined, x: number, z: number) =>
  l?.rows[Math.floor(z / TILE) - l.z0]?.[Math.floor(x / TILE) - l.x0] ?? '#'

// does something stop you at (x, z)? whole tiles for SOLID ones, only the post on a tile that has one (a column, a
// trunk...) so you can walk right up to it, the west half of a slanted wall's tile; the elevator shaft is up to
// whoever drives the car
export function solidAt(l: Layout | undefined, x: number, z: number) {
  if (l?.walls?.some(([cx, cz, sx, sz]) => Math.abs(x - cx) < sx / 2 && Math.abs(z - cz) < sz / 2)) return true
  if (l?.island && Math.hypot(x - l.island.x, z - l.island.z) > l.island.r - 0.4) return true // the wall round its edge
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

const inside = (b: Box, tx: number, tz: number) => tx >= b.x0 && tx <= b.x1 && tz >= b.z0 && tz <= b.z1
// what the map calls the place at (x, z), world units
export function placeAt(l: Layout | undefined, x: number, z: number) {
  const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE), c = tileAt(l, x, z)
  const room = l?.rooms.find((r) => inside(r.area, tx, tz))
  if (room) return room.title
  if (l?.court && inside(l.court, x, z) && OUTDOOR.includes(c)) return 'Patio'
  if (c === 'E') return 'Ascensor'
  if (OUTDOOR.includes(c)) return 'Exterior'
  if (tx < 0) return 'Núcleo'
  return c === 'L' ? 'Lobby' : 'Pasillo'
}
