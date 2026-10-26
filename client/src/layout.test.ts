import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atLiftDoor, buildBuilding, buildFloor, solidAt, tileAt, COLUMN, LIFT, SOLID, SPAWN, TILE } from './layout.ts'

const rooms = (counts: number[]) => counts.map((count, i) => ({ id: `r${i}`, title: `Sala ${i}`, count }))
const walkable = (c: string) => !SOLID.includes(c)

// every walkable tile of a floor must be reachable from the spawn point
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

test('a lone floor: lobby, courtyard void, everything reachable', () => {
  const l = buildFloor([])
  assert.equal(tileAt(l, SPAWN.x, SPAWN.z), 'L')
  assert.deepEqual(l.start, SPAWN)
  assert.ok(reachableAll(l))
})

test('the ground floor: street, front door, lobby, courtyard and rooms all connect', () => {
  const [l] = buildBuilding([rooms([2, 3, 9])])
  assert.equal(tileAt(l, l.start.x, l.start.z), 'o')
  assert.equal(tileAt(l, l.door!.x, l.door!.z - 1), 'D')
  assert.equal(tileAt(l, l.door!.x, l.door!.z + 1), 'D')
  assert.equal(tileAt(l, l.court!.fountain.x, l.court!.fountain.z), 'F')
  assert.ok(reachableAll(l))
  for (const p of l.props) assert.ok('og'.includes(tileAt(l, p.x, p.z)), `${p.kind} stands outside`)
  assert.ok(l.props.some((p) => p.kind === 'sakura'))
})

test('the elevator shaft is in the same place on every floor, its doors facing the lobby', () => {
  const floors = buildBuilding([rooms([2]), rooms([1, 1, 1]), rooms([])])
  for (const l of floors) {
    for (const dz of [-1, 1]) assert.equal(tileAt(l, LIFT.x0 + 1, LIFT.z + dz), 'E')
    assert.equal(tileAt(l, LIFT.x0 - 1, LIFT.z), 'L')
    assert.ok(atLiftDoor(LIFT.x0 - 1, LIFT.z) && !atLiftDoor(LIFT.x0 - 1, LIFT.z + LIFT.w / 2 + 0.5))
    for (const z of [13.8, 14.2]) assert.notEqual(tileAt(l, LIFT.x0 + 1, z), 'E', 'the entrance axis (z = 14) stays clear')
    assert.ok(reachableAll(l))
  }
  assert.equal(new Set(floors.map((l) => l.rows[0].length + l.x0)).size, 1, 'every floor is as long as the longest')
})

test('columns only block their shaft, so you can walk right up to them', () => {
  const l = buildFloor([], { ground: true })
  assert.equal(tileAt(l, 13, 5), 'C')
  assert.ok(solidAt(l, 13, 5))
  assert.ok(!solidAt(l, 13 + COLUMN + 0.1, 5))
  assert.ok(solidAt(l, 1, 1), 'a wall tile is solid all over')
})

test('each exhibit gets a slot on a wall facing an open tile', () => {
  for (const ground of [false, true]) {
    const l = buildFloor(rooms([0, 12, 3, 40, 1]), { ground })
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
  const before = buildBuilding([rooms([2, 2, 2]), rooms([1])])
  const after = buildBuilding([rooms([30, 2, 2, 5, 1, 1, 1, 1]), rooms([1, 9, 9, 9, 9, 9, 9, 9, 9, 9])])
  for (const i of [1, 2]) assert.deepEqual(after[0].rooms[i], before[0].rooms[i])
  assert.deepEqual(after[0].rooms[0].sign, before[0].rooms[0].sign)
  assert.deepEqual(after[1].rooms[0], before[1].rooms[0])
})
