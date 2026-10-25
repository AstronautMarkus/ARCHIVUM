// Turns a floor's rooms into a tile map. Tile (tx, tz) covers world [tx*TILE, (tx+1)*TILE).
// The corridor runs along +x at tz 0..2 with the elevator at its start; rooms alternate north/south.
// Rooms have a fixed width and grow in depth with their exhibits, so new content never moves existing rooms.
// The ground floor also gets the outside: a street and a sidewalk west of the museum's front door.
export const TILE = 2
export const WALL_H = 3
export const DOOR_H = 2.2
export const SPAWN = { x: 2.5 * TILE, z: 1.5 * TILE }
const ROOM_W = 5
const OUT_W = 10, STREET_W = 5, PLAZA_Z0 = -5, PLAZA_Z1 = 7
export const STREET_X = -(OUT_W - STREET_W) * TILE // west of this the ground is street, east is sidewalk

export type RoomIn = { id: string; title: string; count: number }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
export type Prop = { kind: 'tree' | 'lamp'; x: number; z: number }
export type Layout = {
  rows: string[] // rows[tz - z0][tx - x0]: '#' wall, '.' floor, 'D' doorway, 'E' elevator, 'o' outside
  x0: number
  z0: number
  start: { x: number; z: number } // where a visitor appears when they arrive at the museum
  props: Prop[]
  rooms: { id: string; title: string; sign: Slot; slots: Slot[] }[]
}

// frame on the wall behind floor tile (tx, tz); (nx, nz) is the wall's inward normal
const wallSlot = (tx: number, tz: number, nx: number, nz: number): Slot => ({
  x: (tx + 0.5 - nx / 2) * TILE + nx * 0.03,
  z: (tz + 0.5 - nz / 2) * TILE + nz * 0.03,
  rot: Math.atan2(nx, nz),
})
const prop = (kind: Prop['kind'], tx: number, tz: number): Prop => ({ kind, x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE })

export function buildFloor(rooms: RoomIn[], outside = false): Layout {
  const depth = rooms.map((r) => Math.max(3, Math.ceil((r.count - ROOM_W) / 2)))
  const maxN = Math.max(0, ...depth.filter((_, i) => i % 2 === 0))
  const maxS = Math.max(0, ...depth.filter((_, i) => i % 2 === 1))
  const corridorEnd = Math.max(4, Math.ceil(rooms.length / 2) * (ROOM_W + 1))
  const x0 = outside ? -OUT_W - 1 : 0
  const z0 = Math.min(-2 - maxN, outside ? PLAZA_Z0 - 1 : 0)
  const z1 = Math.max(4 + maxS, outside ? PLAZA_Z1 + 1 : 0)
  const grid = Array.from({ length: z1 - z0 + 1 }, () => Array<string>(corridorEnd + 2 - x0).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx - x0] = c }

  for (let tx = 1; tx <= corridorEnd; tx++) for (let tz = 0; tz <= 2; tz++) set(tx, tz, '.')
  set(1, 0, 'E')
  if (outside) {
    for (let tx = -OUT_W; tx < 0; tx++) for (let tz = PLAZA_Z0; tz <= PLAZA_Z1; tz++) set(tx, tz, 'o')
    set(0, 1, 'D') // the front door
  }

  const out = rooms.map((r, i) => {
    const d = depth[i]
    const dir = i % 2 ? 1 : -1 // from the corridor into the room
    const rx = 2 + (i >> 1) * (ROOM_W + 1)
    const doorX = rx + (ROOM_W >> 1), doorZ = dir < 0 ? -1 : 3, far = doorZ + dir * d
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

  // trees along the sidewalk, lamps flanking the front door
  const props = outside ? [...[-4, -1, 4, 7].map((tz) => prop('tree', -5, tz)), prop('lamp', -1, 0), prop('lamp', -1, 2)] : []
  const start = outside ? { x: (-OUT_W + 2.5) * TILE, z: 1.5 * TILE } : SPAWN // in the street, facing the museum
  return { rows: grid.map((r) => r.join('')), x0, z0, start, props, rooms: out }
}

export const tileAt = (l: Layout, x: number, z: number) =>
  l.rows[Math.floor(z / TILE) - l.z0]?.[Math.floor(x / TILE) - l.x0] ?? '#'
