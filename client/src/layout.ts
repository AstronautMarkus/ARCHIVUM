// Turns a floor's rooms into a tile map. Tile (tx, tz) covers world [tx*TILE, (tx+1)*TILE).
// Upper floors: a corridor along +x at tz 0..2, rooms alternating north and south of it.
// Ground floor: a school-like ring instead. From the street you enter a lobby with the reception desk;
// beyond it lies a courtyard with paths, a fountain and cherry trees, framed by arcades, and corridors run along
// its north and south sides with the rooms outside them.
// Rooms have a fixed width and grow in depth with their exhibits, so new content never moves existing rooms;
// more rooms only make the corridor (and the courtyard) longer.
export const TILE = 2
export const WALL_H = 3
export const DOOR_H = 2.2
export const SPAWN = { x: 2.5 * TILE, z: 1.5 * TILE } // next to the elevator, on every floor
export const SOLID = '#CFR' // wall, column, fountain, reception desk
const ROOM_W = 5
// ground floor ring, by tile row: corridor 0-1, arcade 2, courtyard 3-10, arcade 11, corridor 12-13
const RING_END = 13, COURT_Z0 = 3, COURT_Z1 = 10, LOBBY_X1 = 5, COURT_X0 = 7
const OUT_W = 10, STREET_W = 5, PLAZA_Z0 = -1, PLAZA_Z1 = 14
export const STREET_X = -(OUT_W - STREET_W) * TILE // west of this the ground is street, east is sidewalk

export type RoomIn = { id: string; title: string; count: number }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
export type Prop = { kind: 'tree' | 'lamp' | 'sakura'; x: number; z: number }
export type Layout = {
  // rows[tz - z0][tx - x0]: SOLID tiles, '.' floor, 'L' lobby, 'D' doorway, 'E' elevator,
  // and under the open sky 'o' street/sidewalk, 'g' grass, 'p' path
  rows: string[]
  x0: number
  z0: number
  start: { x: number; z: number } // where a visitor appears when they arrive at the museum
  props: Prop[]
  rooms: { id: string; title: string; sign: Slot; slots: Slot[] }[]
  door?: { x: number; z: number; w: number } // the front door (ground floor), world units
  court?: { x0: number; x1: number; z0: number; z1: number; fountain: { x: number; z: number } }
}

// frame on the wall behind floor tile (tx, tz); (nx, nz) is the wall's inward normal
const wallSlot = (tx: number, tz: number, nx: number, nz: number): Slot => ({
  x: (tx + 0.5 - nx / 2) * TILE + nx * 0.03,
  z: (tz + 0.5 - nz / 2) * TILE + nz * 0.03,
  rot: Math.atan2(nx, nz),
})
const prop = (kind: Prop['kind'], tx: number, tz: number): Prop => ({ kind, x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE })

export function buildFloor(rooms: RoomIn[], ground = false): Layout {
  const depth = rooms.map((r) => Math.max(3, Math.ceil((r.count - ROOM_W) / 2)))
  const maxN = Math.max(0, ...depth.filter((_, i) => i % 2 === 0))
  const maxS = Math.max(0, ...depth.filter((_, i) => i % 2 === 1))
  const band = ground ? RING_END : 2 // last row between the north and the south rooms
  const firstX = ground ? COURT_X0 : 2 // on the ground floor rooms start past the lobby
  const roomsEnd = firstX + Math.ceil(rooms.length / 2) * (ROOM_W + 1) - 2 // last column a room uses
  const courtX1 = Math.max(COURT_X0 + 9, roomsEnd) // the courtyard is at least 10 tiles long
  const end = ground ? courtX1 + 3 : Math.max(4, roomsEnd) // last walkable column
  const x0 = ground ? -OUT_W - 1 : 0
  const z0 = Math.min(-2 - maxN, ground ? PLAZA_Z0 - 1 : 0)
  const z1 = Math.max(band + 2 + maxS, ground ? PLAZA_Z1 + 1 : 0)
  const grid = Array.from({ length: z1 - z0 + 1 }, () => Array<string>(end + 2 - x0).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx - x0] = c }
  const fill = (xa: number, xb: number, za: number, zb: number, c: string) => {
    for (let tx = xa; tx <= xb; tx++) for (let tz = za; tz <= zb; tz++) set(tx, tz, c)
  }

  fill(1, end, 0, band, '.')
  const mx = Math.floor((COURT_X0 + courtX1) / 2), mz = (COURT_Z0 + COURT_Z1 - 1) / 2 // where the paths cross
  if (ground) {
    fill(1, LOBBY_X1, 0, band, 'L')
    fill(COURT_X0, courtX1, COURT_Z0, COURT_Z1, 'g')
    fill(COURT_X0, courtX1, mz, mz + 1, 'p')
    fill(mx, mx + 1, COURT_Z0, COURT_Z1, 'p')
    fill(mx, mx + 1, mz, mz + 1, 'F')
    // arcades around the courtyard: a column on every other tile and on the corners
    const ax = LOBBY_X1 + 1, bx = courtX1 + 1, az = COURT_Z0 - 1, bz = COURT_Z1 + 1
    for (let tx = ax; tx <= bx; tx++) {
      for (let tz = az; tz <= bz; tz++) {
        const edgeX = tx === ax || tx === bx, edgeZ = tz === az || tz === bz
        if ((edgeX || edgeZ) && ((tx + tz) % 2 === 0 || (edgeX && edgeZ))) set(tx, tz, 'C')
      }
    }
    fill(2, 2, 2, 4, 'R') // reception desk, on your left as you come in
    fill(0, 0, 6, 7, 'D') // double front door
    fill(-OUT_W, -1, PLAZA_Z0, PLAZA_Z1, 'o')
  }
  set(1, 0, 'E')

  const out = rooms.map((r, i) => {
    const d = depth[i]
    const dir = i % 2 ? 1 : -1 // from the corridor into the room
    const rx = firstX + (i >> 1) * (ROOM_W + 1)
    const doorX = rx + (ROOM_W >> 1), doorZ = dir < 0 ? -1 : band + 1, far = doorZ + dir * d
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

export const tileAt = (l: Layout, x: number, z: number) =>
  l.rows[Math.floor(z / TILE) - l.z0]?.[Math.floor(x / TILE) - l.x0] ?? '#'
