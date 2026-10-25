import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFloor, tileAt, SOLID, SPAWN, TILE } from './layout.ts'

const rooms = (counts: number[]) => counts.map((count, i) => ({ id: `r${i}`, title: `Sala ${i}`, count }))
const walkable = (c: string) => !SOLID.includes(c)

// every walkable tile must be reachable from the spawn point
function reachableAll(l: ReturnType<typeof buildFloor>) {
  const key = (tx: number, tz: number) => `${tx},${tz}`
  const start = [Math.floor(SPAWN.x / TILE), Math.floor(SPAWN.z / TILE)]
  const seen = new Set([key(start[0], start[1])]), queue = [start]
  while (queue.length) {
    const [tx, tz] = queue.pop()!
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + a, nz = tz + b
      if (walkable(tileAt(l, (nx + 0.5) * TILE, (nz + 0.5) * TILE)) && !seen.has(key(nx, nz))) {
        seen.add(key(nx, nz)); queue.push([nx, nz])
      }
    }
  }
  return seen.size === [...l.rows.join('')].filter(walkable).length
}

test('empty floor has a corridor, elevator and walkable spawn', () => {
  const l = buildFloor([])
  assert.equal(tileAt(l, SPAWN.x, SPAWN.z), '.')
  assert.equal(tileAt(l, 1.5 * TILE, 0.5 * TILE), 'E')
  assert.deepEqual(l.start, SPAWN)
  assert.ok(reachableAll(l))
})

test('the ground floor: street, front door, lobby, courtyard and rooms all connect', () => {
  const l = buildFloor(rooms([2, 3, 9]), true)
  assert.equal(tileAt(l, l.start.x, l.start.z), 'o')
  assert.equal(tileAt(l, l.door!.x, l.door!.z - 1), 'D')
  assert.equal(tileAt(l, l.door!.x, l.door!.z + 1), 'D')
  assert.equal(tileAt(l, SPAWN.x, SPAWN.z), 'L', 'the elevator drops you in the lobby')
  assert.equal(tileAt(l, l.court!.fountain.x, l.court!.fountain.z), 'F')
  assert.ok(reachableAll(l))
  for (const p of l.props) assert.ok('og'.includes(tileAt(l, p.x, p.z)), `${p.kind} stands outside`)
  assert.ok(l.props.some((p) => p.kind === 'sakura'))
})

test('each exhibit gets a slot on a wall facing an open tile', () => {
  for (const ground of [false, true]) {
    const l = buildFloor(rooms([0, 12, 3, 40, 1]), ground)
    assert.deepEqual(l.rooms.map((r) => r.slots.length), [0, 12, 3, 40, 1])
    for (const s of l.rooms.flatMap((r) => r.slots)) {
      const nx = Math.sin(s.rot) * 0.2, nz = Math.cos(s.rot) * 0.2
      assert.notEqual(tileAt(l, s.x + nx, s.z + nz), '#', 'front of the frame is open')
      assert.equal(tileAt(l, s.x - nx, s.z - nz), '#', 'back of the frame is wall')
    }
    assert.ok(reachableAll(l))
  }
})

test('adding exhibits or rooms never moves existing rooms', () => {
  for (const ground of [false, true]) {
    const before = buildFloor(rooms([2, 2, 2]), ground)
    const after = buildFloor(rooms([30, 2, 2, 5, 1, 1, 1, 1]), ground)
    for (const i of [1, 2]) assert.deepEqual(after.rooms[i], before.rooms[i])
    assert.deepEqual(after.rooms[0].sign, before.rooms[0].sign)
  }
})
