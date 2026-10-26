// Turns the museum into tile maps, one per floor; floors stack WALL_H apart. Tile (tx, tz) covers
// world [tx*TILE, (tx+1)*TILE). Every floor is a school-like ring: a lobby at the west end, corridors along the
// north and south sides of a central courtyard, and the rooms outside the corridors.
// On the ground floor you come in from the street through the lobby, which has the reception desk, and the
// courtyard has grass, paths, a fountain and cherry trees. Upper floors look down into it from balconies.
// A glass elevator rides up and down the courtyard's west edge, its doors opening onto the lobby of each floor.
// Rooms have a fixed width and grow in depth with their exhibits, so new content never moves existing rooms;
// more rooms only make the building (and its courtyard) longer, the same for every floor.
export const TILE = 2
export const WALL_H = 3.5 // also one storey: floors stack with no gap
export const DOOR_H = 2.2
export const SPAWN = { x: 2.5 * TILE, z: 1.5 * TILE } // a safe spot in the lobby, on every floor
export const SOLID = '#FRv' // wall, fountain, reception desk, courtyard void; columns and the elevator are special
export const MAX_FLOORS = 99
export const COLUMN = 0.35 // half the width of a column
// the elevator shaft: two tiles wide on the courtyard's west edge, beside the entrance axis (rows 6-7) so walking
// in from the street you see straight into the courtyard; its doors face the lobby. z: center, w: width along z,
// door: width of the opening, which leaves room on both sides for the open doors to slide away
export const LIFT = { tx: 6, tz0: 4, tz1: 5, x0: 6 * TILE, z: 5 * TILE, w: 2 * TILE, door: 1.6 }
const ROOM_W = 5
// rows of the ring: corridor 0-1, arcade 2, courtyard 3-10, arcade 11, corridor 12-13
const RING_END = 13, COURT_Z0 = 3, COURT_Z1 = 10, LOBBY_X1 = 5, COURT_X0 = 7
const OUT_W = 10, STREET_W = 5, PLAZA_Z0 = -1, PLAZA_Z1 = 14
export const STREET_X = -(OUT_W - STREET_W) * TILE // west of this the ground is street, east is sidewalk

export type RoomIn = { id: string; title: string; count: number }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
export type Prop = { kind: 'tree' | 'lamp' | 'sakura'; x: number; z: number }
export type Layout = {
  // rows[tz - z0][tx - x0]: SOLID tiles, '.' floor, 'L' lobby, 'D' doorway, 'C' column, 'E' elevator shaft,
  // 'B' balcony (floor with a railing on its courtyard side), and under the open sky 'o' street/sidewalk,
  // 'g' grass, 'p' path
  rows: string[]
  x0: number
  z0: number
  start: { x: number; z: number } // where a visitor appears when they arrive at the museum
  props: Prop[]
  rooms: { id: string; title: string; sign: Slot; slots: Slot[] }[]
  door?: { x: number; z: number; w: number } // the front door (ground floor), world units
  court?: { x0: number; x1: number; z0: number; z1: number; fountain: { x: number; z: number } }
}
type Options = { ground?: boolean; courtX1?: number }

// frame on the wall behind floor tile (tx, tz); (nx, nz) is the wall's inward normal
const wallSlot = (tx: number, tz: number, nx: number, nz: number): Slot => ({
  x: (tx + 0.5 - nx / 2) * TILE + nx * 0.03,
  z: (tz + 0.5 - nz / 2) * TILE + nz * 0.03,
  rot: Math.atan2(nx, nz),
})
const prop = (kind: Prop['kind'], tx: number, tz: number): Prop => ({ kind, x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE })
// last column the rooms of a floor use; the courtyard is at least 10 tiles long
const courtEnd = (rooms: number) => Math.max(COURT_X0 + 9, COURT_X0 + Math.ceil(rooms / 2) * (ROOM_W + 1) - 2)

// all floors share the length of the longest one
export function buildBuilding(floors: RoomIn[][]): Layout[] {
  const courtX1 = Math.max(...floors.map((rooms) => courtEnd(rooms.length)))
  return floors.map((rooms, k) => buildFloor(rooms, { ground: k === 0, courtX1 }))
}

export function buildFloor(rooms: RoomIn[], { ground = false, courtX1 = courtEnd(rooms.length) }: Options = {}): Layout {
  const depth = rooms.map((r) => Math.max(3, Math.ceil((r.count - ROOM_W) / 2)))
  const maxN = Math.max(0, ...depth.filter((_, i) => i % 2 === 0))
  const maxS = Math.max(0, ...depth.filter((_, i) => i % 2 === 1))
  const end = courtX1 + 3 // last walkable column: the east corridor
  const x0 = ground ? -OUT_W - 1 : 0
  const z0 = Math.min(-2 - maxN, ground ? PLAZA_Z0 - 1 : 0)
  const z1 = Math.max(RING_END + 2 + maxS, ground ? PLAZA_Z1 + 1 : 0)
  const grid = Array.from({ length: z1 - z0 + 1 }, () => Array<string>(end + 2 - x0).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx - x0] = c }
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
  // around the courtyard a column on the corners and every fourth tile, enough to hold the floors up; in between,
  // open arcade on the ground floor and balconies upstairs
  const ax = LOBBY_X1 + 1, bx = courtX1 + 1, az = COURT_Z0 - 1, bz = COURT_Z1 + 1
  for (let tx = ax; tx <= bx; tx++) {
    for (let tz = az; tz <= bz; tz++) {
      const edgeX = tx === ax || tx === bx, edgeZ = tz === az || tz === bz
      if (!edgeX && !edgeZ) continue
      const along = edgeX ? tz - az : tx - ax, length = edgeX ? bz - az : bx - ax
      if ((edgeX && edgeZ) || (along % 4 === 0 && along < length - 1)) set(tx, tz, 'C') // never two side by side
      else if (!ground) set(tx, tz, 'B')
    }
  }
  fill(LIFT.tx, LIFT.tx, LIFT.tz0, LIFT.tz1, 'E')
  if (ground) {
    fill(2, 2, 2, 4, 'R') // reception desk, on your left as you come in
    fill(0, 0, 6, 7, 'D') // double front door
    fill(-OUT_W, -1, PLAZA_Z0, PLAZA_Z1, 'o')
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

  const rows = grid.map((r) => r.join(''))
  if (!ground) return { rows, x0, z0, start: SPAWN, props: [], rooms: out }

  // street trees, lamps flanking the door, cherry trees along both long sides of the courtyard
  const props = [...[0, 3, 10, 13].map((tz) => prop('tree', -5, tz)), prop('lamp', -1, 5), prop('lamp', -1, 8)]
  for (let tx = COURT_X0 + 1; tx < courtX1; tx += 3) {
    if (tx < mx - 1 || tx > mx + 2) props.push(prop('sakura', tx, COURT_Z0 + 1), prop('sakura', tx, COURT_Z1 - 1))
  }
  return {
    rows, x0, z0, props, rooms: out,
    start: { x: (-OUT_W + 2.5) * TILE, z: 7 * TILE }, // in the street, facing the door
    door: { x: 0.5 * TILE, z: 7 * TILE, w: 2 * TILE },
    court: {
      x0: COURT_X0 * TILE, x1: (courtX1 + 1) * TILE, z0: COURT_Z0 * TILE, z1: (COURT_Z1 + 1) * TILE,
      fountain: { x: (mx + 1) * TILE, z: (mz + 1) * TILE },
    },
  }
}

export const tileAt = (l: Layout | undefined, x: number, z: number) =>
  l?.rows[Math.floor(z / TILE) - l.z0]?.[Math.floor(x / TILE) - l.x0] ?? '#'

// does something stop you at (x, z)? whole tiles for SOLID ones, only the shaft for a column so you can walk
// right up to it; the elevator shaft is up to whoever drives the car
export function solidAt(l: Layout | undefined, x: number, z: number) {
  const t = tileAt(l, x, z)
  if (t !== 'C') return SOLID.includes(t)
  const cx = (Math.floor(x / TILE) + 0.5) * TILE, cz = (Math.floor(z / TILE) + 0.5) * TILE
  return Math.abs(x - cx) < COLUMN && Math.abs(z - cz) < COLUMN
}

// is (x, z) in the lobby right in front of the elevator?
export const atLiftDoor = (x: number, z: number) =>
  Math.floor(x / TILE) === LIFT.tx - 1 && Math.floor(z / TILE) >= LIFT.tz0 && Math.floor(z / TILE) <= LIFT.tz1
