// Turns a floor's rooms into a tile map. Tile (tx, tz) covers world [tx*TILE, (tx+1)*TILE).
// The corridor runs along +x at tz 0..2 with the elevator at its start; rooms alternate north/south.
// Rooms have a fixed width and grow in depth with their exhibits, so new content never moves existing rooms.
export const TILE = 2
export const WALL_H = 3
export const DOOR_H = 2.2
export const SPAWN = { x: 2.5 * TILE, z: 1.5 * TILE }
const ROOM_W = 5

export type RoomIn = { id: string; title: string; count: number }
export type Slot = { x: number; z: number; rot: number } // a point on a wall surface, rot faces into the room
export type Layout = {
  rows: string[] // rows[tz - z0][tx]: '#' wall, '.' floor, 'D' doorway, 'E' elevator
  z0: number
  rooms: { id: string; title: string; sign: Slot; slots: Slot[] }[]
}

// frame on the wall behind floor tile (tx, tz); (nx, nz) is the wall's inward normal
const wallSlot = (tx: number, tz: number, nx: number, nz: number): Slot => ({
  x: (tx + 0.5 - nx / 2) * TILE + nx * 0.03,
  z: (tz + 0.5 - nz / 2) * TILE + nz * 0.03,
  rot: Math.atan2(nx, nz),
})

export function buildFloor(rooms: RoomIn[]): Layout {
  const depth = rooms.map((r) => Math.max(3, Math.ceil((r.count - ROOM_W) / 2)))
  const maxN = Math.max(0, ...depth.filter((_, i) => i % 2 === 0))
  const maxS = Math.max(0, ...depth.filter((_, i) => i % 2 === 1))
  const z0 = -2 - maxN
  const corridorEnd = Math.max(4, Math.ceil(rooms.length / 2) * (ROOM_W + 1))
  const grid = Array.from({ length: maxN + maxS + 7 }, () => Array<string>(corridorEnd + 2).fill('#'))
  const set = (tx: number, tz: number, c: string) => { grid[tz - z0][tx] = c }

  for (let tx = 1; tx <= corridorEnd; tx++) for (let tz = 0; tz <= 2; tz++) set(tx, tz, '.')
  set(1, 1, 'E')

  const out = rooms.map((r, i) => {
    const d = depth[i]
    const dir = i % 2 ? 1 : -1 // from the corridor into the room
    const x0 = 2 + (i >> 1) * (ROOM_W + 1)
    const doorX = x0 + (ROOM_W >> 1), doorZ = dir < 0 ? -1 : 3, far = doorZ + dir * d
    for (let tx = x0; tx < x0 + ROOM_W; tx++) for (let k = 1; k <= d; k++) set(tx, doorZ + dir * k, '.')
    set(doorX, doorZ, 'D')

    // back wall first, then both side walls from the back toward the door
    const slots: Slot[] = []
    for (let tx = x0; tx < x0 + ROOM_W; tx++) slots.push(wallSlot(tx, far, 0, -dir))
    for (let k = 0; k < d; k++) slots.push(wallSlot(x0, far - dir * k, 1, 0), wallSlot(x0 + ROOM_W - 1, far - dir * k, -1, 0))

    // sign on the corridor side of the door lintel
    const sign = { x: (doorX + 0.5) * TILE, z: (doorZ + 0.5 - dir / 2) * TILE - dir * 0.03, rot: dir < 0 ? 0 : Math.PI }
    return { id: r.id, title: r.title, sign, slots: slots.slice(0, r.count) }
  })
  return { rows: grid.map((r) => r.join('')), z0, rooms: out }
}

export const tileAt = (l: Layout, x: number, z: number) =>
  l.rows[Math.floor(z / TILE) - l.z0]?.[Math.floor(x / TILE)] ?? '#'
