import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBuilding, buildFloor, buildTop, keepLift, liftDoor, LOT, liftShaft, placeAt, solidAt, tileAt, trunk, COLUMN, CORE, CORE_ART, CORE_X0, CORE_Z0, KEEP, LIFTS, SOLID, SPAWN, TILE, TORII,
} from './layout.ts'

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
  for (const p of l.props) assert.ok('gpsT.'.includes(tileAt(l, p.x, p.z)), `${p.kind} stands off the street`)
  assert.ok(l.props.some((p) => p.kind === 'sakura'))
  // the entrance: a column either side of the way in, solid piers at its ends
  const e = l.entrance!
  for (const c of e.columns) assert.ok(solidAt(l, c.x, c.z))
  assert.ok(!solidAt(l, e.columns[0].x, e.z), 'the way in between the columns is clear')
  assert.ok(solidAt(l, e.x + 1, e.z - e.w / 2 + 1) && solidAt(l, e.x + 1, e.z + e.w / 2 - 1), 'a pier at either end')
})

test('the elevator shafts are in the same places on every floor, their doors facing the lobby', () => {
  const floors = buildBuilding([rooms([2]), rooms([1, 1, 1]), rooms([])])
  for (const l of floors) {
    LIFTS.forEach((s, i) => {
      for (const dz of [-1, 1]) {
        assert.equal(tileAt(l, s.x0 + 1, s.z + dz), 'E')
        assert.equal(liftShaft(s.x0 + 1, s.z + dz), i)
      }
      assert.equal(tileAt(l, s.x0 - 1, s.z), 'L')
      assert.equal(liftDoor(s.x0 - 1, s.z), i)
      assert.equal(liftDoor(s.x0 - 1, s.z + s.w / 2 + 0.5), -1, 'only right in front of its doors')
    })
    for (const z of [13.8, 14.2]) assert.notEqual(tileAt(l, LIFTS[0].x0 + 1, z), 'E', 'the entrance axis (z = 14) stays clear')
    assert.ok(reachableAll(l))
  }
})

test('the building is the same box on every floor, with the street going all the way around it', () => {
  const floors = buildBuilding([rooms([2]), rooms([30, 1, 1, 1]), rooms([])])
  assert.equal(new Set(floors.map((l) => JSON.stringify(l.footprint))).size, 1)
  const [g] = floors, f = g.footprint
  for (const l of floors) assert.ok(l.rooms.flatMap((r) => r.slots).every((s) => s.z > f.z0 * TILE && s.z < (f.z1 + 1) * TILE))
  // walking straight out from each side (the core's to the west): garden walk, garden, hedge, sidewalk, street,
  // sidewalk, then the forest to the west and the town everywhere else: a lot, an alley, or garden where a lot didn't fit
  for (const [tx, tz, dx, dz, past] of [[CORE_X0, -1, -1, 0, '[gT]'], [f.x1, -1, 1, 0, '[#sg]'], [9, f.z0, 0, -1, '[#sg]'], [9, f.z1, 0, 1, '[#sg]']] as const) {
    let way = ''
    for (let k = 1; k <= 10; k++) way += tileAt(g, (tx + dx * k + 0.5) * TILE, (tz + dz * k + 0.5) * TILE)
    assert.match(way, new RegExp(`^p+[gT]+hs+o+s+${past}$`))
  }
  assert.match([...Array(10)].map((_, k) => tileAt(g, (CORE_X0 - k - 0.5) * TILE, 7 * TILE)).join(''), /^p+s+o+s+[gT]$/, 'a walk to the door')
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

test('the core stays the same however the museum grows, and leads from the street through the tower to the lobby', () => {
  const core = (l: ReturnType<typeof buildFloor>) => CORE.map((row, i) => [...row].map((_, j) => tileAt(l, (CORE_X0 + j + 0.5) * TILE, (CORE_Z0 + i + 0.5) * TILE)).join(''))
  const [small] = buildBuilding([rooms([])]), [big] = buildBuilding([rooms([40, 40, 9, 9, 9, 9, 9]), rooms([1]), rooms([1])])
  assert.deepEqual(core(small), core(big))
  let way = ''
  for (let tx = -20; tx <= 2; tx++) way += tileAt(big, (tx + 0.5) * TILE, 7.5 * TILE)
  assert.match(way, /^o+s+p+D\.+D\.+DL+$/, 'street, garden walk, porch, front door, hall, east room, lobby')
  assert.ok(solidAt(big, big.door!.x, big.door!.z - 2.5) && solidAt(big, big.door!.x, big.door!.z + 2.5), 'the front door is two tiles wide')
  // every painting hangs on a wall, over floor, and none on another's spot
  assert.equal(CORE_ART.length, 17)
  assert.equal(new Set(CORE_ART.map((s) => `${s.x},${s.z}`)).size, CORE_ART.length)
  for (const s of CORE_ART) {
    const nx = Math.sin(s.rot) * 0.2, nz = Math.cos(s.rot) * 0.2
    assert.equal(tileAt(big, s.x + nx, s.z + nz), '.')
    assert.equal(tileAt(big, s.x - nx, s.z - nz), '#')
  }
  // a slanted wall stops you on its outer (west) half only
  const upper = (CORE_X0 + 1 + 0.5) * TILE, lower = (CORE_X0 + 1 + 0.5) * TILE
  assert.ok(solidAt(big, upper - 0.5, (CORE_Z0 + 4 + 0.5) * TILE + 0.5) && !solidAt(big, upper + 0.5, (CORE_Z0 + 4 + 0.5) * TILE - 0.5))
  assert.ok(solidAt(big, lower - 0.5, (CORE_Z0 + 13 + 0.5) * TILE - 0.5) && !solidAt(big, lower + 0.5, (CORE_Z0 + 13 + 0.5) * TILE + 0.5))
})

test('real windows at both ends of every floor, every other tile, only where there is open air outside', () => {
  const [g, up] = buildBuilding([rooms([2]), rooms([])])
  for (const l of [g, up]) {
    const f = l.footprint, at = (tx: number, tz: number) => tileAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE)
    for (let tz = 0; tz <= 13; tz++) {
      const keep = tz >= KEEP.tz0 && tz <= KEEP.tz1 // the keep stands against the east wall there
      assert.equal(at(f.x1, tz) === 'W', (f.x1 + tz) % 2 === 1 && !keep, 'east end')
      const open = l === up || 'ghpT'.includes(at(f.x0 - 1, tz))
      assert.equal(at(f.x0, tz) === 'W', open && tz % 2 === 1, 'west end')
      // you step into the bay, but not out through its glass
      for (const [tx, out] of [[f.x0, -1], [f.x1, 1]]) {
        if (at(tx, tz) === 'W') assert.ok(!solidAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE) && solidAt(l, (tx + out + 0.5) * TILE, (tz + 0.5) * TILE))
      }
    }
    assert.ok(reachableAll(l))
  }
  assert.ok([1, 3].every((tz) => tileAt(g, 0.5 * TILE, (tz + 0.5) * TILE) === 'W'), 'downstairs, onto the garden by the core')
})

test('a PIN room has its door in the doorway, with wall beside it for the keypad and the exit button', () => {
  const l = buildFloor(rooms([3, 3]).map((r, i) => ({ ...r, locked: i === 0 })))
  assert.deepEqual(l.rooms.map((r) => r.locked), [true, false])
  for (const r of l.rooms) {
    const { tx, tz } = r.door
    assert.equal(tileAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE), 'D')
    assert.ok(solidAt(l, (tx + 1.5) * TILE, (tz + 0.5) * TILE))
  }
})

test('the castle: a keep against the middle of the east wall and a round tower on each corner, all solid', () => {
  const [g, up] = buildBuilding([rooms([2, 3, 1]), rooms([])])
  const f = g.footprint, k = g.keep!, lift = keepLift(g)
  assert.equal(k.x, (f.x1 + 1) * TILE)
  assert.equal(k.z, 7 * TILE, 'on the entrance axis')
  assert.equal(lift.z, k.z)
  // solid but for the hall at its foot, which the corridor leads into, and the elevator's shaft behind it
  for (let x = k.x + 0.1; x < k.x + k.d; x += 0.5) {
    for (let z = k.z - k.w / 2 + 0.1; z < k.z + k.w / 2; z += 0.5) {
      const hall = x < lift.x0 && Math.abs(z - k.z) < lift.w / 2, shaft = x > lift.x0 && Math.abs(z - k.z) < lift.w / 2
      assert.equal(tileAt(g, x, z), hall ? '.' : shaft ? 'E' : 'H')
    }
  }
  assert.equal(tileAt(g, k.x - 1, k.z - 1), 'D')
  assert.equal(tileAt(up, k.x - 1, k.z - 1), '#', 'upstairs the east wall stays shut')
  assert.ok(!g.props.some((p) => p.x > k.x && p.x < k.x + k.d && Math.abs(p.z - k.z) < k.w / 2), 'no tree grows in it')
  assert.equal(g.turrets!.length, 4)
  for (const t of g.turrets!) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) assert.ok(solidAt(g, t.x + a * 1.5, t.z + b * 1.5))
  assert.ok(reachableAll(g) && reachableAll(up))
})

test('the secret office: the keep\'s elevator comes up into a lobby, walled off from the office but for its door', () => {
  const g = buildBuilding([rooms([2, 3, 1])])[0], top = buildTop(g), lift = keepLift(g), door = top.office!
  assert.equal(tileAt(top, lift.x0 + 1, lift.z - 1), 'E')
  assert.equal(tileAt(top, lift.x0 - 1, lift.z), '.', 'its doors open on the lobby')
  assert.equal(tileAt(top, lift.x0 + TILE + 1, lift.z), '#', 'the machinery behind the shaft')
  // in the lobby you can only go through the door, west to the long table
  assert.ok(!solidAt(top, door.x, door.z) && solidAt(top, door.x, door.z + door.w / 2 + 0.1) && solidAt(top, door.x, door.z - door.w / 2 - 0.1))
  for (const dz of [-lift.w / 2, lift.w / 2]) assert.ok(solidAt(top, lift.x0 - 1, lift.z + dz))
  assert.ok(solidAt(top, g.footprint.x1 * TILE + TILE, lift.z), 'the table stands in the middle of the office')
  // the office goes all the way round the lobby, a tile wider than the keep, and ends there
  const k = g.keep!
  const [w0, w1, n0, s1] = [k.x - TILE + 0.3, k.x + k.d + TILE - 0.3, k.z - k.w / 2 - TILE + 0.3, k.z + k.w / 2 + TILE - 0.3]
  for (const [x, z] of [[w0, n0], [w0, s1], [w1, n0], [w1, s1]]) assert.ok(!solidAt(top, x, z), 'its corners are clear')
  // its furniture stands in your way, but leaves a way round the table, between the chairs and the windows
  for (const c of door.chairs) assert.ok(solidAt(top, c.x, c.z))
  for (const [x, z] of [door.desk, door.globe]) assert.ok(solidAt(top, x, z))
  for (let z = n0; z <= s1; z += 0.25) for (const dx of [-0.2, 0, 0.2]) assert.ok(!solidAt(top, w0 + 0.15 + dx, z))
  for (const [x, z] of [[k.x - TILE - 1, k.z], [k.x + k.d + TILE + 1, k.z - k.w / 2 - 1], [k.x, k.z + k.w / 2 + TILE + 1]]) assert.ok(solidAt(top, x, z))
})

test('the map names where you stand: each room inside its walls, and the places around them', () => {
  const l = buildFloor(rooms([3, 12]), { ground: true })
  for (const r of l.rooms) {
    const { x0, x1, z0, z1 } = r.area
    for (let tx = x0; tx <= x1; tx++) for (let tz = z0; tz <= z1; tz++) {
      assert.equal(tileAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE), '.')
      assert.equal(placeAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE), r.title)
    }
    // the doorway is still the corridor
    assert.notEqual(placeAt(l, (r.door.tx + 0.5) * TILE, (r.door.tz + 0.5) * TILE), r.title)
  }
  assert.equal(placeAt(l, SPAWN.x, SPAWN.z), 'Lobby')
  assert.equal(placeAt(l, l.court!.fountain.x - TILE * 2.5, l.court!.fountain.z - TILE * 1.5), 'Patio')
  assert.equal(placeAt(l, l.start.x, l.start.z), 'Exterior')
})

test('the ground floor is a floating island: a disc with a wall round it, nothing past it, houses and forest to its edge', () => {
  const [g, up] = buildBuilding([rooms([4, 6, 3, 5]), rooms([2, 2])]), { x, z, r } = g.island!
  const at = (a: number, d: number) => [x + Math.cos(a) * d, z + Math.sin(a) * d]
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    assert.ok(solidAt(g, ...(at(a, r - 0.2) as [number, number])), 'the wall stops you')
    assert.ok(solidAt(g, ...(at(a, r + 3) as [number, number])), 'and past it there is nothing')
    assert.ok(!solidAt(g, ...(at(a, r - 1.5) as [number, number])), 'a strip of grass runs all round inside it')
  }
  // everything that was on the map before is on the island, well inside the wall
  const f = g.footprint, corners = [[f.x0 - 30, f.z0 - 30], [f.x1 + 11, f.z0 - 30], [f.x0 - 30, f.z1 + 11], [f.x1 + 11, f.z1 + 11]]
  for (const [tx, tz] of corners) assert.ok(Math.hypot(tx * TILE - x, tz * TILE - z) < r - 4)
  // the forest reaches the wall to the west, the town does to the north, east and south: a lot near it each way
  assert.match(tileAt(g, ...(at(Math.PI, r - 8) as [number, number])), /[gT]/)
  for (const a of [0, Math.PI / 2, -Math.PI / 2]) {
    const [px, pz] = at(a, r - 12)
    assert.ok(g.lots!.some((l) => Math.hypot((l.x0 + LOT[l.kind] / 2) * TILE - px, (l.z0 + LOT[l.kind] / 2) * TILE - pz) < 20), `lots toward ${a}`)
  }
  assert.ok(reachableAll(g))
  assert.equal(up.island, undefined, 'upstairs is all building')
})

test('the town: houses on small lots to the north, blocks of flats on big ones east and south, every lot whole', () => {
  const [g] = buildBuilding([rooms([4, 6, 3, 5]), rooms([2, 2])]), lots = g.lots!, f = g.footprint
  assert.ok(lots.filter((l) => l.kind === 'house').length > 40 && lots.filter((l) => l.kind === 'block').length > 8)
  const taken = new Set<string>()
  for (const l of lots) {
    for (let a = 0; a < LOT[l.kind]; a++) {
      for (let b = 0; b < LOT[l.kind]; b++) {
        const key = `${l.x0 + a},${l.z0 + b}`
        assert.ok(!taken.has(key), 'lots never overlap')
        taken.add(key)
        assert.equal(tileAt(g, (l.x0 + a + 0.5) * TILE, (l.z0 + b + 0.5) * TILE), '#')
      }
    }
    if (l.kind === 'house') assert.ok(l.z0 < f.z0, 'houses are north of the block')
    else assert.ok(l.x0 > f.x1 || l.z0 > f.z1, 'blocks are east or south of it')
  }
  // every solid tile out in the town belongs to a lot: nothing half built
  const [x0, x1, z0, z1] = [f.x0 - 30, f.x1 + 10, f.z0 - 10, f.z1 + 10]
  g.rows.forEach((row, i) => [...row].forEach((c, j) => {
    const tx = j + g.x0, tz = i + g.z0
    if (c === '#' && (tx > x1 || tz > z1 || (tz < z0 && tx > x0))) assert.ok(taken.has(`${tx},${tz}`), `${tx},${tz}`)
  }))
  assert.ok(reachableAll(g))
})
