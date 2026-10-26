import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atLiftDoor, buildBuilding, buildFloor, solidAt, tileAt, trunk, COLUMN, LIFT, SOLID, SPAWN, TILE, TORII } from './layout.ts'

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
  for (const p of l.props) assert.ok('gpsT'.includes(tileAt(l, p.x, p.z)), `${p.kind} stands outside, off the street`)
  assert.ok(l.props.some((p) => p.kind === 'sakura'))
  // the entrance: a column either side of the way in, solid piers at its ends
  const e = l.entrance!
  for (const c of e.columns) assert.ok(solidAt(l, c.x, c.z))
  assert.ok(!solidAt(l, e.columns[0].x, e.z), 'the way in between the columns is clear')
  assert.ok(solidAt(l, e.x + 1, e.z - e.w / 2 + 1) && solidAt(l, e.x + 1, e.z + e.w / 2 - 1), 'a pier at either end')
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
})

test('the building is the same box on every floor, with the street going all the way around it', () => {
  const floors = buildBuilding([rooms([2]), rooms([30, 1, 1, 1]), rooms([])])
  assert.equal(new Set(floors.map((l) => JSON.stringify(l.footprint))).size, 1)
  const [g] = floors, f = g.footprint
  for (const l of floors) assert.ok(l.rooms.flatMap((r) => r.slots).every((s) => s.z > f.z0 * TILE && s.z < (f.z1 + 1) * TILE))
  // walking straight out from each side: garden walk, garden, sidewalk, street, sidewalk, then the forest to the
  // west, a house or an alley to the north and the city elsewhere
  for (const [tx, tz, dx, dz, past] of [[f.x0, -1, -1, 0, '[gT]'], [f.x1, 3, 1, 0, '#'], [9, f.z0, 0, -1, '[#s]'], [9, f.z1, 0, 1, '#']] as const) {
    let way = ''
    for (let k = 1; k <= 10; k++) way += tileAt(g, (tx + dx * k + 0.5) * TILE, (tz + dz * k + 0.5) * TILE)
    assert.match(way, new RegExp(`^p+[gT]+s+o+s+${past}$`))
  }
  assert.match([...Array(10)].map((_, k) => tileAt(g, -(k + 0.5) * TILE, 7 * TILE)).join(''), /^p+s+o+s+[gT]$/, 'a walk to the door')
})

test('nothing stands in the ring around the courtyard: open on the ground floor, balconies upstairs', () => {
  const [g, up] = buildBuilding([rooms([]), rooms([])])
  for (const l of [g, up]) assert.ok(!l.rows.join('').includes('C') && !solidAt(l, 13, 5), 'no columns')
  assert.equal(tileAt(g, 13, 5), '.')
  assert.equal(tileAt(up, 13, 5), 'B')
  assert.ok(solidAt(g, 1, 1), 'a wall tile is solid all over')
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

test('past the city: a forest to the west, houses to the north and a shrine in the corner between them', () => {
  const [g] = buildBuilding([rooms([2, 3, 9])]), s = g.shrine!
  assert.ok(solidAt(g, s.x, s.z), 'the hall is solid')
  // from the hall's front, the path runs past the torii out to the street
  let way = ''
  for (let k = 0; k < 20; k++) way += tileAt(g, s.x - 1, s.z + s.d / 2 + (k + 0.5) * TILE)
  assert.match(way, /^p+so/)
  assert.equal(tileAt(g, s.x - 1, s.gate), 'p')
  const tiles = g.rows.join('')
  assert.ok(tiles.split('T').length > 300, 'the forest is full of trees')
  assert.equal(g.props.filter((p) => p.kind === 'tree' || p.kind === 'oak').length, tiles.split('T').length - 1, 'one tree per tree tile')
  // a trunk stops you, the rest of its tile doesn't
  const i = tiles.indexOf('T'), w = g.rows[0].length, tx = (i % w) + g.x0, tz = Math.floor(i / w) + g.z0, t = trunk(tx, tz)
  assert.ok(solidAt(g, t.x, t.z))
  assert.ok(!solidAt(g, t.x + COLUMN + 0.1, t.z))
  // so do the torii's pillars and the lanterns, but not the path between them
  for (const sx of [-1, 1]) assert.ok(solidAt(g, s.x + sx * TORII, s.gate))
  assert.ok(!solidAt(g, s.x, s.gate))
  for (const l of s.lanterns) assert.ok(solidAt(g, l.x, l.z))
  // the houses north of the block line alleys you can walk down from the sidewalk
  assert.equal(tileAt(g, 9.5 * TILE, (g.footprint.z0 - 10.5) * TILE), 's')
  assert.ok(reachableAll(g))
})

test('every prop stops you where it stands, and every tile a post reaches into knows about it', () => {
  const [g] = buildBuilding([rooms([2, 3, 9])])
  for (const p of g.props) assert.ok(solidAt(g, p.x, p.z), `${p.kind} stops you`)
  for (const p of new Set(g.posts.values())) {
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const x = p.x + a * (p.r - 0.01), z = p.z + b * (p.r - 0.01)
      assert.equal(g.posts.get(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`), p, 'and no other post took that tile')
    }
  }
})
