import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFloor, tileAt, SPAWN, TILE } from './layout.ts'

const rooms = (counts: number[]) => counts.map((count, i) => ({ id: `r${i}`, title: `Sala ${i}`, count }))

// every walkable tile must be reachable from the spawn point
function reachableAll(l: ReturnType<typeof buildFloor>) {
  const key = (tx: number, tz: number) => `${tx},${tz}`
  const start = [Math.floor(SPAWN.x / TILE), Math.floor(SPAWN.z / TILE)]
  const seen = new Set([key(start[0], start[1])]), queue = [start]
  while (queue.length) {
    const [tx, tz] = queue.pop()!
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + a, nz = tz + b
      if (tileAt(l, (nx + 0.5) * TILE, (nz + 0.5) * TILE) !== '#' && !seen.has(key(nx, nz))) {
        seen.add(key(nx, nz)); queue.push([nx, nz])
      }
    }
  }
  const open = l.rows.join('').replaceAll('#', '').length
  return seen.size === open
}

test('empty floor has a corridor, elevator and walkable spawn', () => {
  const l = buildFloor([])
  assert.equal(tileAt(l, SPAWN.x, SPAWN.z), '.')
  assert.equal(tileAt(l, 1.5 * TILE, 1.5 * TILE), 'E')
  assert.ok(reachableAll(l))
})

test('each exhibit gets a slot on a wall facing an open tile', () => {
  const l = buildFloor(rooms([0, 12, 3, 40, 1]))
  assert.deepEqual(l.rooms.map((r) => r.slots.length), [0, 12, 3, 40, 1])
  for (const s of l.rooms.flatMap((r) => r.slots)) {
    const nx = Math.sin(s.rot) * 0.2, nz = Math.cos(s.rot) * 0.2
    assert.notEqual(tileAt(l, s.x + nx, s.z + nz), '#', 'front of the frame is open')
    assert.equal(tileAt(l, s.x - nx, s.z - nz), '#', 'back of the frame is wall')
  }
  assert.ok(reachableAll(l))
})

test('adding exhibits or rooms never moves existing rooms', () => {
  const before = buildFloor(rooms([2, 2, 2]))
  const after = buildFloor(rooms([30, 2, 2, 5]))
  for (const i of [1, 2]) assert.deepEqual(after.rooms[i], before.rooms[i])
  assert.deepEqual(after.rooms[0].sign, before.rooms[0].sign)
})
