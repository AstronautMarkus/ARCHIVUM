import { Fragment, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls, Text, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  buildBuilding, liftDoor, liftShaft, noise, solidAt, tileAt, CORE, OUTDOOR, CORE_ART, CORE_X0, CORE_Z0, DOOR_H, LIFTS, SPAWN, TILE, TORII, WALL_H,
  type Layout, type Prop, type Slot,
} from './layout'
import { LIVE_URL } from './config'
import { fileUrl, floorColor, isUnlocked, lockRoom, type Exhibit, type Floor, type Museum } from './api'
import { cantera, ceiling, checker, hedge, limestone, pennant, railing, spots, whiteBrick } from './textures'
import core from './core.json'
import { Automap } from './Automap'

const EYE = 1.6
const GOLD = '#ffcc33'
const HAZE = '#9fd0f5' // sky at the horizon; outdoor fog fades into it
const DARK = new THREE.Color('#000')
const STOREY = WALL_H // one floor seen from outside
const PARAPET = 0.9 // how far the walls around the roof rise above it
const BEAM = 0.4 // the edge of a floor's slab, seen from the courtyard
const SPRING = 2.1 // how high above its floor an arch of the courtyard arcade springs from its columns
const ARCH = 0.5 // how thick the arches are
const LEDGE = 0.4 // how high the stone ledge at the foot of a window's glass stands
// the core's paintings, as exhibits so they hang, get picked and open in the viewer like any other
const CORE_EXHIBITS: Exhibit[] = core.map((e, i) => ({ id: `core${i}`, room: '', author: '', kind: 'photo', thumb: '', text: '', ...e }))
// the city around the block: storeys and brick of each building, changing every three tiles, so each of the
// houses north of the block (two tiles square, an alley on every third tile) gets one
const CITY = [[3, 0], [4, 1], [2, 2], [5, 3], [3, 1], [1, 2], [2, 3], [1, 0]]
const cityBlock = (tx: number, tz: number) => Math.floor(noise(Math.floor(tx / 3), Math.floor(tz / 3)) * CITY.length)
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]], AROUND = [...SIDES, [1, 1], [1, -1], [-1, 1], [-1, -1]]
const odd = ([tx, tz]: readonly number[]) => ((tx + tz) % 2 + 2) % 2 === 1 // which wall tiles get a window
const tmp = new THREE.Vector3()

function retro(t: THREE.Texture, repeat = false) {
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
}

// a pixelated copy of a texture repeating rx times across and ry times up (negative mirrors it), starting oy up
function useTiled(tex: THREE.Texture, rx = 1, ry = 1, oy = 0) {
  return useMemo(() => {
    const t = tex.clone()
    retro(t, true)
    t.repeat.set(rx, ry)
    t.offset.set(0, oy)
    return t
  }, [tex, rx, ry, oy])
}

// draw distance: fog [near, far] outdoors and indoors, how far the camera sees, and the fog color outdoors.
// Thick fog also swallows the sky and the city, which otherwise stay sunny
export const VIEWS = {
  lejos: { out: [40, 150], in: [15, 90], far: 200, haze: HAZE, thick: false },
  media: { out: [25, 70], in: [12, 55], far: 200, haze: HAZE, thick: false },
  niebla: { out: [2, 20], in: [1, 12], far: 30, haze: '#a3a3a3', thick: true },
}
export type View = keyof typeof VIEWS

// titles: gold with a black outline so they read on any wall
const TITLE = { color: GOLD, outlineWidth: '8%', outlineColor: '#000' }

type Props = {
  museum: Museum; floor: number; token: string; quiet: boolean; view: View; fps: RefObject<HTMLElement | null>
  onFloor: (k: number) => void; onElevator: (on: boolean) => void; onPick: (ex: Exhibit | null) => void
  onLock: (locked: boolean) => void; onChanged: () => void; onChat: (m: Chat) => void; say: RefObject<(text: string) => void>
  onAct: (a: Act | null) => void; map: RefObject<HTMLCanvasElement | null>; bigMap: boolean
}
export type Chat = { id: number; n: string; chat: string }

// the whole building in one scene; `floor` is where you stand, kept in sync both ways with stairs and elevator
export function MuseumView({ museum, floor, token, quiet, view, fps, map, bigMap, onFloor, onElevator, onPick, onAct, onLock, onChanged, onChat, say }: Props) {
  const byRoom = Map.groupBy(museum.exhibits, (e) => e.room)
  const floors = museum.floors.map((f: Floor) => museum.rooms.filter((r) => r.floor === f.id)
    .map((r) => ({ id: r.id, title: r.title, locked: r.locked, count: r.count ?? byRoom.get(r.id)?.length ?? 0 })))
  const key = JSON.stringify(floors)
  const layouts = useMemo(() => buildBuilding(floors), [key])
  // experiment: a painted panorama for the sky; useMemo(makeSky, []) brings back the pixel-art one
  const sky = useMemo(() => loadSky('/sky.jpg', 20), [])
  const fog = useMemo(() => new THREE.Fog('#000', 3, 24), [])
  return (
    // render at ~240 lines and let CSS scale it up with hard pixels
    <Canvas flat dpr={Math.min(1, 240 / window.innerHeight)} camera={{ fov: 75, near: 0.05, far: 80 }}>
      {/* in thick fog the sky is the fog itself, the same color object, so it darkens with it indoors */}
      <primitive key={view} attach="background" object={VIEWS[view].thick ? fog.color : sky} />
      <primitive attach="fog" object={fog} />
      <Suspense fallback={null}>
        <World layouts={layouts} colors={museum.floors.map(floorColor)} byRoom={byRoom} quiet={quiet} current={floor} view={view} onChanged={onChanged} />
        <Avatars floorId={museum.floors[floor]?.id ?? ''} token={token} onChanged={onChanged} onChat={onChat} say={say} />
      </Suspense>
      <Player layouts={layouts} floor={floor} view={view} onFloor={onFloor} onElevator={onElevator} onPick={onPick} onAct={onAct} />
      <Fps el={fps} />
      <Automap el={map} layouts={layouts} floor={floor} big={bigMap} />
      <PointerLockControls selector="#lock" onLock={() => onLock(true)} onUnlock={() => onLock(false)} />
    </Canvas>
  )
}

// frames per second, written straight into `el` twice a second so counting doesn't re-render anything
function Fps({ el }: { el: RefObject<HTMLElement | null> }) {
  const n = useRef({ frames: 0, time: 0 })
  useFrame((_, dt) => {
    const c = n.current
    c.frames++
    if ((c.time += dt) < 0.5) return
    if (el.current) el.current.textContent = `${Math.round(c.frames / c.time)} FPS`
    c.frames = c.time = 0
  })
  return null
}

// a panorama as the sky, lifted `lift` degrees so the city painted in it rises over the 3D one; what it leaves at the
// bottom is under the ground anyway. three turns it into a cube map once, ignoring offsets, so it's drawn shifted on
// a canvas that stays empty until then
function loadSky(url: string, lift: number) {
  const c = document.createElement('canvas'), img = new Image()
  c.width = c.height = 0
  const t = Object.assign(new THREE.CanvasTexture(c), { mapping: THREE.EquirectangularReflectionMapping, colorSpace: THREE.SRGBColorSpace })
  img.onload = () => {
    c.width = img.width
    c.height = img.height
    c.getContext('2d')!.drawImage(img, 0, -Math.round((img.height * lift) / 180))
    t.needsUpdate = true
  }
  img.src = url
  return t
}

// pixel-art city sky as an equirectangular background: blue gradient, clouds, and a skyline with lit windows
function makeSky() {
  const W = 1024, H = 512, horizon = H / 2
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, horizon) // zenith to horizon
  grad.addColorStop(0, '#1b4aa0')
  grad.addColorStop(1, HAZE)
  g.fillStyle = grad
  g.fillRect(0, 0, W, horizon)
  g.fillStyle = '#3c4656'
  g.fillRect(0, horizon, W, H - horizon)
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 // fixed seed: everyone sees the same city
  for (let i = 0; i < 30; i++) {
    const x = rand() * W, y = 50 + rand() * 100, r = 5 + rand() * 10
    for (let k = 0; k < 7; k++) {
      const bx = x + (rand() - 0.5) * r * 5, by = y + (rand() - 0.5) * r
      g.fillStyle = k < 2 ? '#d5e6f5' : '#ffffff'
      for (const wrap of [-W, 0, W]) {
        g.beginPath()
        g.ellipse(bx + wrap, by, r * 1.8, r, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  // two rows of towers on the horizon: hazy ones far away, darker ones in front with windows
  const rows = [['#8aa6c1', 40, 120, 0], ['#56677d', 25, 150, 0.3]] as const
  for (const [color, minH, maxH, lit] of rows) {
    for (let x = 0; x < W;) {
      const w = 14 + rand() * 30, h = minH + rand() * (maxH - minH)
      g.fillStyle = color
      g.fillRect(x, horizon - h, w, h)
      if (lit) {
        for (let wy = horizon - h + 4; wy < horizon - 4; wy += 6) {
          for (let wx = x + 3; wx < x + w - 4; wx += 5) {
            g.fillStyle = rand() < lit ? '#ffd66b' : '#46566b'
            g.fillRect(wx, wy, 2, 3)
          }
        }
      }
      x += w + rand() * 6
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// the wall texture with a window painted on: one per tile and storey, kept clear of the cell's bottom quarter
// so a short top band (parapet) shows plain wall
function withWindow(tex: THREE.Texture) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.drawImage(tex.image as HTMLImageElement, 0, 0, 128, 128)
  g.fillStyle = '#2b2b30'
  g.fillRect(34, 24, 60, 70)
  const glass = g.createLinearGradient(0, 28, 0, 90)
  glass.addColorStop(0, '#9fc3e6')
  glass.addColorStop(1, '#2d4f7a')
  g.fillStyle = glass
  g.fillRect(38, 28, 52, 62)
  g.fillStyle = '#2b2b30'
  g.fillRect(62, 28, 4, 62)
  g.fillRect(38, 56, 52, 4)
  return new THREE.CanvasTexture(c)
}

type Cell = [number, number, number] // tile x, tile z, height of the floor it belongs to
type Box = [number, number, number, number, number, number] // center x, y, z and size x, y, z
type Slant = [number, number, string] // tile x, tile z, '\' or '/'

// The structure of every floor is batched by kind into a few instanced meshes, so 3 floors or 99 cost about the
// same draw calls. Exhibits, signs and media, the heavy part, exist only for your floor and the ones next to it.
function World({ layouts, colors, byRoom, quiet, current, view, onChanged }: {
  layouts: Layout[]; colors: string[]; byRoom: Map<string, Exhibit[]>; quiet: boolean; current: number; view: View; onChanged: () => void
}) {
  // the museum is a white gallery with a stone arcade (see textures.ts); Freedoom's art is for the city, the street,
  // the shrine and the elevator
  const [wall, lobby, ceil, spot, stone, iron, leaves] = useMemo(() => [whiteBrick(), limestone(), ceiling(), spots(), cantera(), railing(), hedge()], [])
  const palette = colors.join()
  const marble = useMemo(() => colors.map(checker), [palette]) // one floor pattern per storey, in its own color
  const [lite, facade, street, sidewalk, door, grass, cobbles, wood, metal, panel, plate, steel,
    light, paint, pbrick, brick, brick1, stwall, bark, ...water] = useTexture([
    '/doom/tlite6_1.png', '/doom/stonew5.png', '/doom/asphalt.png', '/doom/pston2.png', '/doom/door9_1.png',
    '/doom/grass1.png', '/doom/mflr8_3.png', '/doom/wood.png', '/doom/door2_5.png',
    '/doom/aqpanl08.png', '/doom/aqpanl05.png', '/doom/flat23.png', '/doom/flat17.png', '/doom/pwhite.png',
    '/doom/pbrick8.png', '/doom/brick.png', '/doom/brick1.png', '/doom/stwall.png', '/doom/mywood.png',
    '/doom/fwater1.png', '/doom/fwater2.png', '/doom/fwater3.png', '/doom/fwater4.png',
  ])
  useMemo(() => water.forEach((t) => retro(t)), [water])
  const bricks = [pbrick, brick, brick1, stwall]
  const [wallWin, ...brickWin] = useMemo(() => [wall, pbrick, brick, brick1, stwall].map(withWindow), [wall, pbrick, brick, brick1, stwall])
  const ground = layouts[0]
  const top = layouts.length * STOREY + PARAPET // the museum is as tall as its floors, plus a parapet
  const near = (k: number) => Math.abs(k - current) <= 1
  const field = useTiled(grass, 500, 500)

  // sort every tile of every floor into what gets drawn there
  const t = useMemo(() => {
    const t = {
      inner: [] as Cell[], houses: [] as Cell[], doors: [] as Cell[], columns: [] as Cell[], desk: [] as Cell[],
      rails: [] as Box[], beams: [] as Box[], parapet: [] as Box[], curbs: [] as Box[], paint: [] as Box[],
      floors: layouts.map(() => [] as Cell[]), arches: [] as Arch[], grass: [] as Cell[], path: [] as Cell[], street: [] as Cell[],
      sidewalk: [] as Cell[], ceiling: [] as Cell[], lights: [] as Cell[],
      windows: [] as Cell[], panes: [] as Box[], ledges: [] as Box[], hedges: [] as Cell[],
      core: [] as Cell[], roof: [] as Cell[], crest: [] as Box[], slants: [] as Slant[],
    }
    layouts.forEach((layout, k) => {
      // the block's streets run past the core as well as the building
      const y = k * STOREY, roof = k === layouts.length - 1, f = { ...layout.footprint, x0: CORE_X0 }
      const at = (tx: number, tz: number) => tileAt(layout, (tx + 0.5) * TILE, (tz + 0.5) * TILE)
      layout.rows.forEach((row, i) => [...row].forEach((c, j) => {
        const tx = j + layout.x0, tz = i + layout.z0, cell: Cell = [tx, tz, y], x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE
        const core = k === 0 && tx >= CORE_X0 && tx < 0 && tz >= CORE_Z0 && tz < CORE_Z0 + CORE.length // not the city in its columns
        if (c === '#') {
          // the city faces the far sidewalk; the museum's walls face its own floors, and outside the skin covers them
          if (AROUND.some(([a, b]) => 'so'.includes(at(tx + a, tz + b)))) t.houses.push(cell)
          else if (SIDES.some(([a, b]) => !('#' + OUTDOOR).includes(at(tx + a, tz + b)))) t.inner.push(cell)
          // the core has no skin: its own walls rise into a parapet around its roof wherever they face outside
          if (core && AROUND.some(([a, b]) => OUTDOOR.includes(at(tx + a, tz + b)))) t.crest.push([x, WALL_H + PARAPET / 2, z, TILE, PARAPET, TILE])
        } else if (c === 'h') t.hedges.push(cell)
        else if (c === '\\' || c === '/') t.slants.push([tx, tz, c])
        else if (c === 'o') {
          t.street.push(cell)
          // a zebra crossing in front of the door, and elsewhere a dashed line down the middle of the street
          const { door } = layout
          if (door && tx < 0 && Math.abs(z - door.z) < door.w / 2) for (const o of [-0.6, 0, 0.6]) t.paint.push([x + o, 0.01, z, 0.35, 0.01, TILE])
          else if (SIDES.every(([a, b]) => at(tx + a, tz + b) === 'o')) {
            const alongZ = tz >= f.z0 && tz <= f.z1, alongX = tx >= f.x0 && tx <= f.x1 // neither: a corner
            if (alongX !== alongZ) t.paint.push([x, 0.01, z, alongX ? 1 : 0.12, 0.01, alongZ ? 1 : 0.12])
          }
        } else if (c === 's') {
          t.sidewalk.push(cell)
          for (const [a, b] of SIDES) { // a curb where the sidewalk meets the street or the garden
            if ('ogpT'.includes(at(tx + a, tz + b))) t.curbs.push([x + (a * TILE) / 2, 0.075, z + (b * TILE) / 2, a ? 0.2 : TILE, 0.15, b ? 0.2 : TILE])
          }
        } else if ('gFTH'.includes(c)) t.grass.push(cell) // under the fountain and the shrine's hall too
        else if (c === 'p') t.path.push(cell)
        else if (c !== 'v' && c !== 'E') { // the courtyard and the elevator shaft stay open all the way up
          ;('.LB'.includes(c) && !(tx & 1) && !(tz & 1) ? t.lights : t.ceiling).push(cell) // a light every other tile
          // the core keeps its own stone floor whatever color the ground floor gets, and has a roof of its own
          ;(core ? t.core : t.floors[k]).push(cell)
          if (core) t.roof.push([tx, tz, WALL_H])
          if (c === 'D') t.doors.push(cell)
          if (c === 'W') {
            // a window bay in a west or east wall, under a lintel as high as a doorway's: glass across its outer side
            // down to a stone ledge, so you step in and look straight out
            t.windows.push(cell)
            const out = '.L'.includes(at(tx + 1, tz)) ? -1 : 1, gx = x + out * (TILE / 2 - 0.03)
            t.panes.push([gx, y + (LEDGE + DOOR_H) / 2, z, 0, DOOR_H - LEDGE, TILE])
            t.ledges.push([gx - out * 0.08, y + LEDGE / 2, z, 0.15, LEDGE, TILE])
          }
          if (c === 'C') {
            t.columns.push(cell)
            // an arch on to the next column along the arcade, two to five tiles on with open floor in between
            for (const [a, b] of [[1, 0], [0, 1]]) {
              for (let n = 1; n <= 5; n++) {
                const next = at(tx + a * n, tz + b * n)
                if (next === 'C' && n > 1) t.arches.push([x + (a * n * TILE) / 2, y, z + (b * n * TILE) / 2, n, a])
                if (next !== '.' && next !== 'B') break
              }
            }
          }
          if (c === 'R') t.desk.push(cell)
          for (const [a, b] of SIDES) {
            const n = at(tx + a, tz + b)
            // a thin railing along the courtyard edge, running past the columns and a bit beyond each tile so the
            // pieces meet without gaps
            if ((c === 'B' || c === 'C') && n === 'v') {
              t.rails.push([x + a * 0.47 * TILE, y + 0.5, z + b * 0.47 * TILE, a ? 0.12 : TILE + 0.2, 1, b ? 0.12 : TILE + 0.2])
            }
            // where the ceiling meets the open courtyard, a stone beam shows the slab of the floor above; on the top
            // floor it rises into the parapet around the roof
            if (c !== 'D' && 'vgpF'.includes(n)) {
              const lo = y + WALL_H - BEAM, hi = roof ? top : y + WALL_H
              ;(roof ? t.parapet : t.beams).push([x + (a * TILE) / 2, (lo + hi) / 2, z + (b * TILE) / 2, a ? 0.24 : TILE + 0.24, hi - lo, b ? 0.24 : TILE + 0.24])
            }
          }
        }
      }))
      // the slab's edge runs on across the glass where a shaft meets the courtyard, flush with the beams either side
      // but thinner, so it stops just short of the car's glass back
      const lo = y + WALL_H - BEAM, hi = roof ? top : y + WALL_H
      ;(roof ? t.parapet : t.beams).push(...LIFTS.flatMap((s) => [-1, 1].map((d): Box =>
        [s.x0 + TILE + 0.04, (lo + hi) / 2, s.z + (d * TILE) / 2, 0.16, hi - lo, TILE])))
    })
    // the outside of the museum: a thin skin just outside its outer walls, a box per tile and storey with a window
    // painted on every other tile, and a parapet on top, so inside you see your floor's own walls. Real windows leave
    // a hole in it, and so does the core where it stands against the ground storey. The north and south sides run
    // past the ends to close the corners
    const f = ground.footprint, skin = { win: [] as Box[], plain: [] as Box[], parapet: [] as Box[] }
    const wrap = (tx: number, tz: number, [ox, oz]: number[], x: number, z: number, sx: number, sz: number) => {
      layouts.forEach((l, k) => {
        if (tileAt(l, (tx + 0.5) * TILE, (tz + 0.5) * TILE) === 'W') return
        if (!k && !OUTDOOR.includes(tileAt(ground, (tx + ox + 0.5) * TILE, (tz + oz + 0.5) * TILE))) return
        ;(odd([tx, tz]) ? skin.win : skin.plain).push([x, (k + 0.5) * STOREY, z, sx, STOREY, sz])
      })
      skin.parapet.push([x, top - PARAPET / 2, z, sx, PARAPET, sz])
    }
    for (let tx = f.x0; tx <= f.x1; tx++) {
      const end = tx === f.x0 ? -1 : tx === f.x1 ? 1 : 0
      wrap(tx, f.z0, [0, -1], (tx + 0.5) * TILE + end * 0.1, f.z0 * TILE - 0.1, TILE + Math.abs(end) * 0.2, 0.2)
      wrap(tx, f.z1, [0, 1], (tx + 0.5) * TILE + end * 0.1, (f.z1 + 1) * TILE + 0.1, TILE + Math.abs(end) * 0.2, 0.2)
    }
    for (let tz = f.z0; tz <= f.z1; tz++) {
      wrap(f.x0, tz, [-1, 0], f.x0 * TILE - 0.1, (tz + 0.5) * TILE, 0.2, TILE)
      wrap(f.x1, tz, [1, 0], (f.x1 + 1) * TILE + 0.1, (tz + 0.5) * TILE, 0.2, TILE)
    }
    // a stone cornice around the building at every floor line and on top of the parapet: one band per side, the
    // east and west ones stopping short of the others so their tops don't flicker against each other
    const [ax, bx, az, bz] = [f.x0 * TILE - 0.35, (f.x1 + 1) * TILE + 0.35, f.z0 * TILE - 0.35, (f.z1 + 1) * TILE + 0.35]
    const lines = [...layouts.map((_, k) => (k + 1) * STOREY), top]
    const cornice = {
      x: lines.flatMap((y) => [az + 0.2, bz - 0.2].map((z): Box => [(ax + bx) / 2, y + 0.1, z, bx - ax, 0.2, 0.4])),
      z: lines.flatMap((y) => [ax + 0.2, bx - 0.2].map((x): Box => [x, y + 0.1, (az + bz) / 2, 0.4, 0.2, bz - az - 0.8])),
      long: [(bx - ax) / TILE, 0.1] as [number, number], wide: [(bz - az) / TILE, 0.1] as [number, number],
    }
    const city = [...Map.groupBy(t.houses, ([tx, tz]) => cityBlock(tx, tz))].map(([i, cells]) => ({
      i, h: CITY[i][0] * STOREY + 0.5, brick: CITY[i][1], win: cells.filter(odd), plain: cells.filter((c) => !odd(c)),
    }))
    const deskZ = t.desk.reduce((s, [, tz]) => s + (tz + 0.5) * TILE, 0) / (t.desk.length || 1)
    return { ...t, skin, city, deskZ, cornice }
  }, [layouts, top, ground])

  return (
    <>
      {/* the city stays out of "walls": it never hides an exhibit, and that keeps the aiming ray cheap */}
      {t.city.map(({ i, h, brick, win, plain }) => (
        <Fragment key={i}>
          <WallSet cells={win} tex={brickWin[brick]} height={h} every={STOREY} fog={VIEWS[view].thick} />
          <WallSet cells={plain} tex={bricks[brick]} height={h} every={STOREY} fog={VIEWS[view].thick} />
        </Fragment>
      ))}
      <group name="walls">
        <WallSet cells={t.inner} tex={wall} height={WALL_H} />
        <Boxes boxes={t.skin.win} tex={wallWin} />
        <Boxes boxes={t.skin.plain} tex={wall} />
        <Boxes boxes={t.skin.parapet} tex={wall} repeat={[1, PARAPET / STOREY]} />
        <Columns cells={t.columns} tex={stone} />
        <Arches spans={t.arches} tex={stone} />
        <Boxes boxes={t.rails} tex={iron} cut />
        <Boxes boxes={t.beams} tex={stone} repeat={[1, BEAM / TILE]} />
        <Boxes boxes={t.parapet} tex={stone} repeat={[1, (BEAM + PARAPET) / TILE]} />
        <WallSet cells={t.desk} tex={wood} height={1.1} every={1.1} />
        <WallSet cells={t.windows} tex={wall} height={WALL_H - DOOR_H} base={DOOR_H} />
        <Boxes boxes={t.ledges} tex={stone} repeat={[1, LEDGE / TILE]} />
        <Boxes boxes={t.crest} tex={wall} repeat={[1, PARAPET / STOREY]} />
        <Boxes boxes={t.cornice.x} tex={stone} repeat={t.cornice.long} />
        <Boxes boxes={t.cornice.z} tex={stone} repeat={t.cornice.wide} />
        <Slants cells={t.slants} tex={{ wall, floor: lobby, ceiling: ceil, roof: stone }} />
      </group>
      <Panes panes={t.panes} />
      <WallSet cells={t.hedges} tex={leaves} height={1} />
      {/* grass on to the horizon under the edges of the map */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial map={field} />
      </mesh>
      <Boxes boxes={t.curbs} tex={facade} repeat={[1, 0.15 / TILE]} />
      <Boxes boxes={t.paint} tex={paint} />
      {t.floors.map((cells, k) => <TileSet key={k} cells={cells} tex={marble[k]} />)}
      <TileSet cells={t.core} tex={lobby} />
      <TileSet cells={t.roof} tex={stone} />
      <TileSet cells={t.grass} tex={grass} />
      <TileSet cells={t.path} tex={cobbles} />
      <TileSet cells={t.street} tex={street} />
      <TileSet cells={t.sidewalk} tex={sidewalk} />
      <TileSet cells={t.ceiling} tex={ceil} y={WALL_H - 0.005} />
      <TileSet cells={t.lights} tex={spot} y={WALL_H - 0.005} />
      <TileSet cells={t.windows} tex={ceil} y={DOOR_H - 0.005} />
      {t.doors.map(([tx, tz, y]) => tx === 0 && y === 0
        ? <Lintel key={`${tx},${tz},${y}`} tx={tx} tz={tz} y={y} tex={wall} soffit={ceil} top={STOREY} />
        : <Lintel key={`${tx},${tz},${y}`} tx={tx} tz={tz} y={y} tex={wall} soffit={ceil} top={WALL_H} />)}
      {ground.door && <FrontDoor at={ground.door} tex={door} />}
      {ground.entrance && <Entrance at={ground.entrance} tex={{ stone: lobby, trim: stone, iron, door }} />}
      {t.desk.length > 0 && (
        <Text position={[TILE + 0.03, 2.2, t.deskZ]} rotation-y={Math.PI / 2} fontSize={0.6} {...TITLE}>RECEPCIÓN</Text>
      )}
      {ground.court && (
        <>
          <Fountain at={ground.court.fountain} stone={stone} water={water} />
          <Petals court={ground.court} />
        </>
      )}
      {ground.shrine && <Shrine at={ground.shrine} tex={{ wood, bark, stone: facade, lamp: light }} />}
      <Props props={ground.props} />
      {LIFTS.map((_, i) => <Elevator key={i} i={i} floors={layouts.length} near={near} tex={{ stone, metal, lamp: lite, panel, plate, steel }} />)}
      {layouts.map((layout, k) => near(k) && (
        <group key={k} position-y={k * STOREY}>
          {layout.rooms.map((r) => (
            <Text key={r.id} position={[r.sign.x, (DOOR_H + WALL_H) / 2, r.sign.z]} rotation-y={r.sign.rot}
              fontSize={0.22} maxWidth={TILE * 1.8} textAlign="center" {...TITLE}>
              {r.title.toUpperCase()}
            </Text>
          ))}
        </group>
      ))}
      <group name="exhibits">
        {layouts.map((layout, k) => near(k) && layout.rooms.filter((r) => r.locked).map((r) => (
          <PinRoom key={r.id} room={r} y={k * STOREY} tex={metal} onRelock={() => { lockRoom(r.id); onChanged() }} />
        )))}
        {near(0) && CORE_ART.map((slot, i) => CORE_EXHIBITS[i] && (
          <Suspense key={i} fallback={null}>
            <ExhibitView ex={CORE_EXHIBITS[i]} slot={slot} quiet={quiet} />
          </Suspense>
        ))}
        {layouts.map((layout, k) => near(k) && (
          <group key={k} position-y={k * STOREY}>
            {layout.rooms.flatMap((r) => (byRoom.get(r.id) ?? []).map((ex, i) => (
              <Suspense key={ex.id} fallback={null}>
                <ExhibitView ex={ex} slot={r.slots[i]} quiet={quiet} />
              </Suspense>
            )))}
          </group>
        ))}
      </group>
    </>
  )
}

// one instanced box per tile, from its floor + base up, `size` wide; the texture repeats once across and every
// `every` meters up. Without fog it stays sunlit even seen from the dark inside (the city over the roofs)
function WallSet({ cells, tex, height, base = 0, every = TILE, size = TILE, fog = true }: {
  cells: Cell[]; tex: THREE.Texture; height: number; base?: number; every?: number; size?: number; fog?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const map = useTiled(tex, 1, height / every, base / every) // starting up off the floor, the bricks carry on from below
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach(([tx, tz, y], i) => ref.current.setMatrixAt(i, m.makeTranslation((tx + 0.5) * TILE, y + base + height / 2, (tz + 0.5) * TILE)))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [cells, height, base])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
      <boxGeometry args={[size, height, size]} />
      {/* a new material when fog changes: it's compiled into the shader */}
      <meshBasicMaterial key={String(fog)} map={map} fog={fog} />
    </instancedMesh>
  )
}

// one textured square per tile, y above its floor: a floor, or a ceiling facing down when y is high up. Floors sit
// a hair above their storey so they cover the tops of the walls below instead of flickering against them
function TileSet({ cells, tex, y = 0.005 }: { cells: Cell[]; tex: THREE.Texture; y?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geometry = useMemo(() => new THREE.PlaneGeometry(TILE, TILE).rotateX(y > 1 ? Math.PI / 2 : -Math.PI / 2), [y])
  const map = useTiled(tex)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach(([tx, tz, fy], i) => ref.current.setMatrixAt(i, m.makeTranslation((tx + 0.5) * TILE, fy + y, (tz + 0.5) * TILE)))
    ref.current.instanceMatrix.needsUpdate = true
  }, [cells, y])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, cells.length]}>
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

// The elevators: glass shafts on the courtyard's west edge, each with a car that really travels it. Player drives
// the cars (you call one from its door, ride it, pick a floor); this only draws one.
// shortcut: each visitor has their own cars, so a friend riding theirs seems to float up the shaft on your screen
// at: floor it's at (fractional while moving); target: floor it's going to; doors: 0 shut .. 1 open;
// v: speed in floors per second; still: seconds since it shut its doors or arrived, for the pauses in between
const cars = LIFTS.map(() => ({ at: 0, target: 0, doors: 0, v: 0, still: 1 }))
const GLASS = { color: HAZE, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }

type LiftTextures = Record<'stone' | 'metal' | 'lamp' | 'panel' | 'plate' | 'steel', THREE.Texture>

function Elevator({ i, floors, near, tex }: { i: number; floors: number; near: (k: number) => boolean; tex: LiftTextures }) {
  const { x0, z, w, door } = LIFTS[i], car = cars[i], cx = x0 + TILE / 2, H = floors * STOREY
  const leafW = door / 2, panelW = (w - door) / 2 // two leaves fill the opening; the panels beside it hide them open
  const cab = useRef<THREE.Group>(null!)
  const leaves = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]
  // the floor the car stands at (-1 between floors): that landing's doors open and shut together with the car's;
  // every other landing shows its doors shut
  const [docked, setDocked] = useState(0)
  useFrame(() => {
    cab.current.position.y = car.at * STOREY
    leaves.forEach((leaf, i) => { // car left, car right, landing left, landing right; they slide behind the panels
      leaf.current.position.z = z + (i % 2 ? 1 : -1) * (leafW / 2 + car.doors * leafW * 0.95)
    })
    const d = Number.isInteger(car.at) ? car.at : -1
    if (d !== docked) setDocked(d)
  })
  // corner posts up the whole shaft and a machine room on top; on every floor a lintel and two panels around the
  // doors, and closed landing doors wherever the car isn't
  const frame = useMemo(() => [
    ...[[x0, -1], [x0, 1], [x0 + TILE, -1], [x0 + TILE, 1]].map(([x, s]): Box => [x, H / 2, z + (s * w) / 2, 0.15, H, 0.15]),
    [cx, H + 0.6, z, TILE + 0.3, 1.2, w + 0.3] as Box,
    ...Array.from({ length: floors }, (_, k): Box[] => [
      [x0, k * STOREY + (DOOR_H + STOREY) / 2, z, 0.2, STOREY - DOOR_H, w],
      ...[-1, 1].map((s): Box => [x0, k * STOREY + DOOR_H / 2, z + (s * (door + panelW)) / 2, 0.2, DOOR_H, panelW]),
    ]).flat(),
  ], [floors, H, x0, cx, z, w, door, panelW])
  const landings = useMemo(() => {
    const leaf = (k: number, s: number): Box => [x0 + 0.02, k * STOREY + DOOR_H / 2, z + (s * leafW) / 2, 0.06, DOOR_H, leafW]
    const shut = Array.from({ length: floors }, (_, k) => k).filter((k) => k !== docked)
    return { left: shut.map((k) => leaf(k, -1)), right: shut.map((k) => leaf(k, 1)) }
  }, [floors, docked, x0, z, leafW])
  // the right leaf shows the door picture flipped, so the pair meets in the middle like real elevator doors
  const leaf = useTiled(tex.metal), flipped = useTiled(tex.metal, -1)
  const wallTex = useTiled(tex.panel, 2), frontTex = useTiled(tex.plate), floorTex = useTiled(tex.steel, 1, 2)
  const lampTex = useTiled(tex.lamp, 1, 2)
  const leafMesh = (i: number, x: number) => (
    <mesh ref={leaves[i]} position={[x, DOOR_H / 2, z + ((i % 2 ? 1 : -1) * leafW) / 2]}>
      <boxGeometry args={[0.06, DOOR_H, leafW]} />
      <meshBasicMaterial map={i % 2 ? flipped : leaf} />
    </mesh>
  )
  return (
    <>
      <Boxes boxes={frame} tex={tex.stone} />
      <Boxes boxes={landings.left} tex={tex.metal} />
      <Boxes boxes={landings.right} tex={tex.metal} repeat={[-1, 1]} />
      {[[cx, z - w / 2, 0, TILE], [cx, z + w / 2, 0, TILE], [x0 + TILE, z, Math.PI / 2, w]].map(([x, zz, r, width], i) => (
        <mesh key={i} position={[x, H / 2, zz]} rotation-y={r}>
          <planeGeometry args={[width, H]} />
          <meshBasicMaterial {...GLASS} />
        </mesh>
      ))}
      {/* the car: steel walls, a lit ceiling, a glass back onto the courtyard, and its doors */}
      <group ref={cab}>
        <mesh position={[cx, 0.05, z]}><boxGeometry args={[TILE - 0.1, 0.1, w - 0.1]} /><meshBasicMaterial map={floorTex} /></mesh>
        <mesh position={[cx, 3.05, z]}><boxGeometry args={[TILE - 0.1, 0.1, w - 0.1]} /><meshBasicMaterial map={lampTex} /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[cx, 1.55, z + s * (w / 2 - 0.05)]}>
            <boxGeometry args={[TILE - 0.1, 3, 0.06]} />
            <meshBasicMaterial map={wallTex} />
          </mesh>
        ))}
        <mesh position={[x0 + 0.18, (DOOR_H + 3.05) / 2, z]}>
          <boxGeometry args={[0.04, 3.05 - DOOR_H, w - 0.1]} />
          <meshBasicMaterial map={frontTex} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[x0 + 0.18, DOOR_H / 2, z + (s * (door + panelW)) / 2]}>
            <boxGeometry args={[0.04, DOOR_H, panelW - 0.05]} />
            <meshBasicMaterial map={frontTex} />
          </mesh>
        ))}
        <mesh position={[x0 + TILE - 0.08, 1.55, z]}><boxGeometry args={[0.04, 3, w - 0.1]} /><meshBasicMaterial {...GLASS} /></mesh>
        {leafMesh(0, x0 + 0.13)}
        {leafMesh(1, x0 + 0.13)}
      </group>
      {/* the landing doors where the car stands, inside the stone frame, moving with the car's */}
      <group position-y={docked * STOREY} visible={docked >= 0}>
        {leafMesh(2, x0 + 0.02)}
        {leafMesh(3, x0 + 0.02)}
      </group>
      {Array.from({ length: floors }, (_, k) => near(k) && (
        <Text key={k} position={[x0 - 0.12, k * STOREY + 2.85, z]} rotation-y={-Math.PI / 2} fontSize={0.3} {...TITLE}>
          ASCENSOR
        </Text>
      ))}
    </>
  )
}

// instanced boxes placed and sized one by one: railings, stairs, the facade skin; `cut` ones are see-through
// wherever their texture is transparent, like an iron railing
function Boxes({ boxes, tex, repeat = [1, 1], cut = false }: { boxes: Box[]; tex: THREE.Texture; repeat?: [number, number]; cut?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const map = useTiled(tex, repeat[0], repeat[1])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), at = new THREE.Vector3(), size = new THREE.Vector3()
    boxes.forEach(([x, y, z, sx, sy, sz], i) => ref.current.setMatrixAt(i, m.compose(at.set(x, y, z), q, size.set(sx, sy, sz))))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [boxes])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]}>
      <boxGeometry />
      <meshBasicMaterial map={map} alphaTest={cut ? 0.5 : 0} />
    </instancedMesh>
  )
}

// window glass, placed and sized like Boxes but flat, across x (their x size is ignored)
function Panes({ panes }: { panes: Box[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geometry = useMemo(() => new THREE.PlaneGeometry().rotateY(Math.PI / 2), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), at = new THREE.Vector3(), size = new THREE.Vector3()
    panes.forEach(([x, y, z, , sy, sz], i) => ref.current.setMatrixAt(i, m.compose(at.set(x, y, z), q, size.set(1, sy, sz))))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [panes])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, panes.length]}>
      <meshBasicMaterial {...GLASS} />
    </instancedMesh>
  )
}

// the core's slanted walls: a thin wall from corner to corner of each tile, up into the parapet, and the floor,
// ceiling and roof of the tile's inside half, so its outside half stays garden. Few and fixed, so one mesh per part
function Slants({ cells, tex }: { cells: Slant[]; tex: Record<'wall' | 'floor' | 'ceiling' | 'roof', THREE.Texture> }) {
  const h = WALL_H + PARAPET, long = TILE * Math.SQRT2 + 0.2 // a hair longer, to tuck into the walls at either end
  const parts = useMemo(() => {
    const half = (y: number) => mergeGeometries(cells.map(([tx, tz, c]) => {
      const corners = c === '\\' ? [[0, 0], [1, 0], [1, 1]] : [[1, 0], [1, 1], [0, 1]] // the inside: north-east or south-east
      return new THREE.BufferGeometry()
        .setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(([u, v]) => [(tx + u) * TILE, y, (tz + v) * TILE]), 3))
        .setAttribute('uv', new THREE.Float32BufferAttribute(corners.flat(), 2))
    }))
    const wall = mergeGeometries(cells.map(([tx, tz, c]) => new THREE.BoxGeometry(long, h, 0.2)
      .rotateY(c === '\\' ? -Math.PI / 4 : Math.PI / 4).translate((tx + 0.5) * TILE, h / 2, (tz + 0.5) * TILE)))
    return { wall, floor: half(0.005), ceiling: half(WALL_H - 0.005), roof: half(WALL_H + 0.005) }
  }, [cells, h, long])
  const maps = {
    wall: useTiled(tex.wall, long / TILE, h / TILE), floor: useTiled(tex.floor), ceiling: useTiled(tex.ceiling), roof: useTiled(tex.roof),
  }
  return (['wall', 'floor', 'ceiling', 'roof'] as const).map((k) => (
    <mesh key={k} geometry={parts[k]}><meshBasicMaterial map={maps[k]} side={THREE.DoubleSide} /></mesh>
  ))
}

// round stone columns: a square base, the shaft, a capital flaring out to carry the arches and a pier over it up
// to the floor above, all in one instanced mesh. The base is as wide as what stops you (COLUMN)
type Arch = [number, number, number, number, number] // center x, floor y, center z, span in tiles, 1 if it runs along x
const square = (bottom: number, top: number, h: number, y: number) => // a box tapering from bottom to top half-width
  new THREE.CylinderGeometry(top * Math.SQRT2, bottom * Math.SQRT2, h, 4).rotateY(Math.PI / 4).translate(0, y + h / 2, 0)
function Columns({ cells, tex }: { cells: Cell[]; tex: THREE.Texture }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geometry = useMemo(() => mergeGeometries([
    square(0.35, 0.32, 0.4, 0),
    new THREE.CylinderGeometry(0.22, 0.25, SPRING - 0.7, 12).translate(0, 0.4 + (SPRING - 0.7) / 2, 0),
    square(0.19, 0.3, 0.3, SPRING - 0.3),
    square(0.28, 0.28, WALL_H - SPRING, SPRING), // a hair wider than the arches, so it covers their ends
  ]), [])
  const map = useTiled(tex)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach(([tx, tz, y], i) => ref.current.setMatrixAt(i, m.makeTranslation((tx + 0.5) * TILE, y, (tz + 0.5) * TILE)))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [cells])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, cells.length]}>
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

// the arches between columns: a stone panel from the capitals up to the floor above, its opening a segmental arch
// (the arc of the circle through both springing points and the crown), so wide spans stay arches and don't turn
// into flattened ellipses. One instanced mesh per span; extruded shapes are UV'd in meters, so the stone repeats
// once per tile
function Arches({ spans, tex }: { spans: Arch[]; tex: THREE.Texture }) {
  const map = useTiled(tex, 1 / TILE, 1 / TILE)
  return [...Map.groupBy(spans, (s) => s[3])].map(([n, list]) => <ArchSet key={n} n={n} spans={list} map={map} />)
}

function ArchSet({ n, spans, map }: { n: number; spans: Arch[]; map: THREE.Texture }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const geometry = useMemo(() => {
    const w = (n * TILE) / 2, h = WALL_H - SPRING, open = w - 0.3 // the capitals are 0.3 wide on either side
    const rise = Math.min(open, h - 0.25), r = (open * open + rise * rise) / (2 * rise), a = Math.atan2(r - rise, open)
    const shape = new THREE.Shape().moveTo(-w, 0).lineTo(-w, h).lineTo(w, h).lineTo(w, 0).lineTo(open, 0)
    shape.absarc(0, rise - r, r, a, Math.PI - a, false)
    return new THREE.ExtrudeGeometry(shape, { depth: ARCH, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -ARCH / 2)
  }, [n])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    spans.forEach(([x, y, z, , alongX], i) => ref.current.setMatrixAt(i, m.makeRotationY(alongX ? 0 : Math.PI / 2).setPosition(x, y + SPRING, z)))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [spans])
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, spans.length]}>
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

// The entrance tower, standing in the core's waist between its slanted walls: two solid piers and two stone columns
// two storeys tall hold up a block with the museum's name on its frieze, over a balcony. It stands the same height
// however many floors the museum has. Its back wall rests on the core's wall over the front door, which slides up
// into it, and rises over the core's roof. Banners hang on the piers and flags fly out in the garden
const OPEN = 2 * STOREY, TOWER = 4 * STOREY // how high the porch is open, and the top of the tower
function Entrance({ at, tex }: { at: NonNullable<Layout['entrance']>; tex: Record<'stone' | 'trim' | 'iron' | 'door', THREE.Texture> }) {
  const { x, z, w, d, columns, flags } = at
  const back = x + d + TILE, depth = back - x, mid = (x + back) / 2, porch = w - 2 * TILE // between the piers
  const win = useMemo(() => withWindow(tex.stone), [tex.stone])
  const front = useTiled(win, w / TILE, (TOWER - OPEN) / STOREY), side = useTiled(tex.stone, depth / TILE, (TOWER - OPEN) / TILE)
  const rear = useTiled(tex.stone, w / TILE, (OPEN - WALL_H) / TILE)
  const floor = useTiled(tex.stone, d / TILE, porch / TILE), door = useTiled(tex.door)
  const [banner, flag] = useMemo(() => [pennant(16, 48), pennant(32, 20)], [])
  const column = useMemo(() => mergeGeometries([
    square(0.45, 0.42, 0.45, 0),
    new THREE.CylinderGeometry(0.32, 0.36, OPEN - 0.95, 12).translate(0, 0.45 + (OPEN - 0.95) / 2, 0),
    square(0.3, 0.5, 0.5, OPEN - 0.5),
  ]), [])
  const piers = useMemo(() => [-1, 1].map((s): Box => [x + d / 2, OPEN / 2, z + s * (w / 2 - TILE / 2), d, OPEN, TILE]), [x, d, z, w])
  const trim = useMemo((): Box[] => [
    [x - 0.1, OPEN + 0.6, z, 0.3, 1.2, w + 0.2], // the frieze
    [x - 0.15, OPEN + 1.3, z, 0.7, 0.2, w + 0.7], // the cornice over it
    [mid - 0.1, TOWER + 0.1, z, depth + 0.6, 0.2, w + 0.6], // the crowning cornice
    [x - 0.3, 0.06, z, 0.6, 0.12, porch], // a step up into the porch
    [x + (1.4 + d) / 2, STOREY - 0.15, z, d - 1.4, 0.3, porch], // the balcony
  ], [x, z, w, d, mid, depth, porch])
  const rail = useMemo((): Box[] => [[x + 1.4, STOREY + 0.5, z, 0.06, 1, porch]], [x, z, porch])
  return (
    <>
      <Boxes boxes={piers} tex={tex.stone} repeat={[1, OPEN / TILE]} />
      <Boxes boxes={trim} tex={tex.trim} />
      <Boxes boxes={rail} tex={tex.iron} cut />
      {/* the block over the porch: windows on its front, plain stone elsewhere, the porch's ceiling underneath */}
      <mesh position={[mid, (OPEN + TOWER) / 2, z]}>
        <boxGeometry args={[depth, TOWER - OPEN, w]} />
        {[side, front, side, side, side, side].map((m, i) => <meshBasicMaterial key={i} attach={`material-${i}`} map={m} />)}
      </mesh>
      {/* the back wall under it, a hair bigger than the core's parapet it swallows */}
      <mesh position={[back - TILE / 2, (WALL_H + OPEN) / 2, z]}>
        <boxGeometry args={[TILE + 0.1, OPEN - WALL_H, w + 0.1]} />
        <meshBasicMaterial map={rear} />
      </mesh>
      {columns.map((c) => <mesh key={c.z} geometry={column} position={[c.x, 0, c.z]}><meshBasicMaterial map={tex.trim} /></mesh>)}
      <mesh position={[x + d / 2, 0.02, z]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[d, porch]} />
        <meshBasicMaterial map={floor} />
      </mesh>
      {/* two more doors either side of the real one, for show */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x + d - 0.01, 1.5, z + s * 3]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[1.4, 3]} />
          <meshBasicMaterial map={door} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x - 0.03, 4.2, z + s * (w / 2 - TILE / 2)]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[1.2, 3.6]} />
          <meshBasicMaterial map={banner} />
        </mesh>
      ))}
      {flags.map((f) => <Flag key={f.z} at={f} tex={flag} />)}
      <Text position={[x - 0.26, OPEN + 0.6, z]} rotation-y={-Math.PI / 2} fontSize={0.75} {...TITLE}>ARCHIVUM</Text>
    </>
  )
}

// a flagpole with a gilt ball on top and its flag flying toward +z, a wave running down it from the pole
function Flag({ at, tex }: { at: { x: number; z: number }; tex: THREE.Texture }) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(1.8, 1.1, 8, 1).translate(0.9, 0, 0), [])
  useFrame(({ clock }) => {
    const p = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3 - clock.elapsedTime * 4 + at.z) * 0.08 * p.getX(i))
    p.needsUpdate = true
  })
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position-y={3.5}><cylinderGeometry args={[0.05, 0.07, 7, 6]} /><meshBasicMaterial color="#d8d8d8" /></mesh>
      <mesh position-y={7.05}><sphereGeometry args={[0.1, 6, 4]} /><meshBasicMaterial color={GILT} /></mesh>
      <mesh geometry={geometry} position-y={6.35} rotation-y={-Math.PI / 2}><meshBasicMaterial map={tex} side={THREE.DoubleSide} /></mesh>
    </group>
  )
}

// the wall over a doorway: its bricks carry on from the walls beside it, and its underside is ceiling
function Lintel({ tx, tz, y, tex, soffit, top }: {
  tx: number; tz: number; y: number; tex: THREE.Texture; soffit: THREE.Texture; top: number
}) {
  const h = top - DOOR_H
  const map = useTiled(tex, 1, h / TILE, DOOR_H / TILE), under = useTiled(soffit)
  return (
    <mesh position={[(tx + 0.5) * TILE, y + (DOOR_H + top) / 2, (tz + 0.5) * TILE]}>
      <boxGeometry args={[TILE, h, TILE]} />
      {[map, map, map, under, map, map].map((m, i) => <meshBasicMaterial key={i} attach={`material-${i}`} map={m} />)}
    </mesh>
  )
}

// The front door slides up into the lintel like a Doom door when you come near, and drops behind you.
// shortcut: it only reacts to you, so other visitors seem to walk through it while it's closed on your screen
const frontDoor = { open: 0 } // 0 closed .. 1 open; Player reads it to block the doorway

function FrontDoor({ at, tex }: { at: NonNullable<Layout['door']>; tex: THREE.Texture }) {
  const ref = useRef<THREE.Mesh>(null!)
  const near = useRef(false)
  const sound = useMemo(() => ({ open: new Audio('/doom/dsdoropn.wav'), close: new Audio('/doom/dsdorcls.wav') }), [])
  const map = useTiled(tex, at.w / TILE, 1) // one door leaf per tile
  useFrame(({ camera }, dt) => {
    const now = Math.hypot(camera.position.x - at.x, camera.position.z - at.z) < 4
    if (now !== near.current) {
      near.current = now
      const s = now ? sound.open : sound.close
      s.currentTime = 0
      s.volume = 0.5
      s.play().catch(() => {}) // blocked until the first click
    }
    frontDoor.open = THREE.MathUtils.clamp(frontDoor.open + (now ? 2.5 : -2.5) * Math.min(dt, 0.1), 0, 1)
    ref.current.position.y = DOOR_H / 2 + frontDoor.open * (DOOR_H + 0.02) // open, clear of the lintel's underside
  })
  return (
    <mesh ref={ref} position={[at.x, DOOR_H / 2, at.z]}>
      <boxGeometry args={[0.25, DOOR_H, at.w]} />
      <meshBasicMaterial map={map} />
    </mesh>
  )
}

// ---- PIN rooms ----

// what you point at that you can press: a PIN room's keypad outside, or the exit button inside
export type Act = { kind: 'pin' | 'exit'; room: string; title: string }
// each PIN room's door: 0 shut .. 1 open; `want` it open for another `t` seconds. It opens when the PIN is right (or
// from the exit button inside), stays while you're in the doorway, and shuts a moment after you've gone through
const roomDoors = new Map<string, { open: number; want: boolean; t: number }>()
const roomDoor = (id: string) => roomDoors.get(id) ?? roomDoors.set(id, { open: 0, want: false, t: 0 }).get(id)!
export const openRoomDoor = (id: string) => Object.assign(roomDoor(id), { want: true, t: 8 })
const blockedByRoomDoor = (l: Layout, x: number, z: number) =>
  l.rooms.some((r) => r.locked && Math.floor(x / TILE) === r.door.tx && Math.floor(z / TILE) === r.door.tz && roomDoor(r.id).open < 0.8)

function PinRoom({ room, y, tex, onRelock }: { room: Layout['rooms'][number]; y: number; tex: THREE.Texture; onRelock: () => void }) {
  const { dir, door: { tx, tz } } = room
  const ref = useRef<THREE.Mesh>(null!)
  const map = useTiled(tex)
  const sound = useMemo(() => ({ open: new Audio('/doom/dsdoropn.wav'), close: new Audio('/doom/dsdorcls.wav') }), [])
  const cx = (tx + 0.5) * TILE, cz = (tz + 0.5) * TILE, bx = (tx + 1.5) * TILE
  useFrame(({ camera: { position: p } }, dt) => {
    dt = Math.min(dt, 0.1)
    const d = roomDoor(room.id), sameFloor = Math.abs(p.y - (y + EYE)) < 1.5
    const along = ((p.z - cz) * dir) / TILE // negative in the corridor, positive inside the room
    const inDoorway = sameFloor && Math.abs(along) < 1 && Math.abs(p.x - cx) < TILE / 2
    if (d.want) {
      d.t = inDoorway ? 1.5 : d.t - dt
      if (d.t <= 0) d.want = false
    }
    const before = d.open, wanted = d.want || (inDoorway && d.open > 0)
    d.open = THREE.MathUtils.clamp(d.open + (wanted ? 2 : -2) * dt, 0, 1)
    const start = wanted ? before === 0 && d.open > 0 : before === 1 && d.open < 1 // it just began to open or to shut
    if (start) {
      const s = wanted ? sound.open : sound.close
      s.currentTime = 0
      s.volume = Math.max(0, 1 - Math.hypot(p.x - cx, p.z - cz) / 20) * 0.6
      s.play().catch(() => {}) // blocked until the first click
    }
    ref.current.position.y = DOOR_H / 2 + d.open * (DOOR_H + 0.02)
    // shut behind whoever opened it and the room is locked again, once they're out in the corridor
    if (!d.want && d.open === 0 && isUnlocked(room.id) && (along < 0 || !sameFloor)) onRelock()
  })
  const face = (side: number) => (tz + 0.5 + (side * dir) / 2) * TILE + side * dir * 0.06 // a wall tile's face: -1 corridor, 1 room
  return (
    <group position-y={y}>
      <mesh ref={ref} position={[cx, DOOR_H / 2, cz]}>
        <boxGeometry args={[TILE, DOOR_H, 0.25]} />
        <meshBasicMaterial map={map} />
      </mesh>
      <Terminal x={bx} z={face(-1)} rot={dir < 0 ? 0 : Math.PI} act={{ kind: 'pin', room: room.id, title: room.title }} label="PIN" />
      <Terminal x={bx} z={face(1)} rot={dir < 0 ? Math.PI : 0} act={{ kind: 'exit', room: room.id, title: room.title }} label="SALIDA" />
    </group>
  )
}

// a small panel on a wall that Player's crosshair finds by its `act`
function Terminal({ x, z, rot, act, label }: { x: number; z: number; rot: number; act: Act; label: string }) {
  return (
    <group position={[x, 1.3, z]} rotation-y={rot} userData={{ act }}>
      <mesh>
        <boxGeometry args={[0.6, 0.5, 0.12]} />
        <meshBasicMaterial color="#1c211c" />
      </mesh>
      <mesh position-z={0.065}>
        <planeGeometry args={[0.5, 0.4]} />
        <meshBasicMaterial color="#8cff6b" />
      </mesh>
      <Text position-z={0.07} fontSize={0.12} color="#0a2a0a">{label}</Text>
    </group>
  )
}

// stone basin with animated Doom water and a spout in the middle, where the courtyard paths cross
function Fountain({ at, stone, water }: { at: { x: number; z: number }; stone: THREE.Texture; water: THREE.Texture[] }) {
  const surface = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(({ clock }) => { surface.current.map = water[Math.floor(clock.elapsedTime * 4) % water.length] })
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position-y={0.35}>
        <boxGeometry args={[2 * TILE, 0.7, 2 * TILE]} />
        <meshBasicMaterial map={stone} />
      </mesh>
      <mesh position-y={0.72} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2 * TILE - 0.4, 2 * TILE - 0.4]} />
        <meshBasicMaterial ref={surface} map={water[0]} />
      </mesh>
      <mesh position-y={1.2}>
        <boxGeometry args={[0.5, 1.8, 0.5]} />
        <meshBasicMaterial map={stone} />
      </mesh>
    </group>
  )
}

// cherry petals drifting down over the courtyard
function Petals({ court }: { court: NonNullable<Layout['court']> }) {
  const N = 120, H = 7
  const geometry = useMemo(() => {
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      pos.set([court.x0 + Math.random() * (court.x1 - court.x0), Math.random() * H, court.z0 + Math.random() * (court.z1 - court.z0)], i * 3)
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3))
  }, [court.x0, court.x1, court.z0, court.z1])
  useFrame(({ clock }, dt) => {
    const p = geometry.attributes.position as THREE.BufferAttribute, t = clock.elapsedTime
    dt = Math.min(dt, 0.1)
    for (let i = 0; i < N; i++) {
      const y = p.getY(i) - dt * 0.5
      p.setXYZ(i, p.getX(i) + Math.sin(t + i) * dt * 0.4, y < 0 ? H : y, p.getZ(i) + Math.cos(t * 0.7 + i) * dt * 0.3)
    }
    p.needsUpdate = true
  })
  return <points geometry={geometry}><pointsMaterial color="#f6b8cf" size={0.08} /></points>
}

// pixel-art tree, drawn once per palette: a trunk with three branches under a cloud of blossom or leaf squares
function makeTree(colors: string[]) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 80
  const g = c.getContext('2d')!
  g.fillStyle = '#5b3a29'
  g.fillRect(29, 40, 6, 40)
  for (const [x, y, dx] of [[30, 46, -2], [33, 44, 2], [31, 40, 0]]) {
    for (let k = 0; k < 9; k++) g.fillRect(x + dx * k, y - k * 2, 3, 3)
  }
  let seed = 3
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 27
    g.fillStyle = colors[Math.min(3, Math.floor(rand() * 2 + (Math.sin(a) < 0 ? 2 : 0)))] // lighter on top
    g.fillRect(Math.round(32 + Math.cos(a) * r * 1.1), Math.round(24 + Math.sin(a) * r * 0.75), 3, 3)
  }
  return new THREE.CanvasTexture(c)
}
const BLOSSOM = ['#e98aab', '#f4a7c0', '#f7c6d9', '#fbe0ea'], LEAVES = ['#1e3b3c', '#2d5a35', '#4a8a3c', '#7cb44e']
// how much bigger than Doom size each prop is drawn, so trees read as trees
const SCALE = { tree: 1.6, oak: 2.2, lamp: 1, sakura: 1.75, statue: 1.5, light: 1 }

function Props({ props }: { props: Prop[] }) {
  const sakura = useMemo(() => makeTree(BLOSSOM), []), oak = useMemo(() => makeTree(LEAVES), [])
  const [tree, lamp, statue, light] = useTexture(['/doom/smita0.png', '/doom/tlmpa0.png', '/doom/smt2a0.png', '/doom/colua0.png'])
  const art = { tree, oak, lamp, statue, light, sakura }
  useMemo(() => [tree, oak, lamp, statue, light, sakura].forEach((t) => retro(t)), [tree, oak, lamp, statue, light, sakura])
  return [...Map.groupBy(props, (p) => p.kind)].map(([kind, list]) => (
    <Billboards key={kind} props={list} tex={art[kind]} scale={SCALE[kind]} />
  ))
}

// every prop of a kind in one instanced mesh, so a forest costs one draw call. Upright billboards like in Doom:
// each turns toward you around the vertical axis only, so looking down doesn't tilt them off the ground
const turn = new THREE.Matrix4()
function Billboards({ props, tex, scale }: { props: Prop[]; tex: THREE.Texture; scale: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const img = tex.image as HTMLImageElement, w = img.width * PX * scale, h = img.height * PX * scale
  const geometry = useMemo(() => new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), [w, h])
  useFrame(({ camera }) => {
    props.forEach((p, i) => {
      const s = p.s ?? 1
      turn.makeRotationY(Math.atan2(camera.position.x - p.x, camera.position.z - p.z)).scale(tmp.set(s, s, s)).setPosition(p.x, 0, p.z)
      ref.current.setMatrixAt(i, turn)
    })
    ref.current.instanceMatrix.needsUpdate = true
  })
  // they move every frame, so a bounding sphere would always be stale; the forest is everywhere anyway
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, props.length]} frustumCulled={false}>
      <meshBasicMaterial map={tex} alphaTest={0.5} />
    </instancedMesh>
  )
}

// paper behind a wooden lattice, for the front of the shrine
function makeLattice() {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d')!
  g.fillStyle = '#3b2416'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#e6dcc0'
  g.fillRect(2, 2, 14, 14)
  return new THREE.CanvasTexture(c)
}

const RED = '#c22f2a', INK = '#1d1a1a', GILT = '#d6a419', STRAW = '#d9c27a'

// a little shrine like Hakurei's: a red torii where its path leaves the street, stone lanterns along the path, and
// a wooden hall on a stone base under a bark roof, with a straw rope, a bell and an offering box on its porch
function Shrine({ at, tex }: { at: NonNullable<Layout['shrine']>; tex: Record<'wood' | 'bark' | 'stone' | 'lamp', THREE.Texture> }) {
  const { x, z, w, d, gate } = at
  const lanterns = useMemo(() => ({
    stone: at.lanterns.flatMap(({ x, z }): Box[] => [[x, 0.15, z, 0.6, 0.3, 0.6], [x, 0.65, z, 0.2, 0.7, 0.2], [x, 1.45, z, 0.75, 0.14, 0.75], [x, 1.58, z, 0.2, 0.14, 0.2]]),
    lit: at.lanterns.map(({ x, z }): Box => [x, 1.19, z, 0.42, 0.38, 0.42]),
  }), [at.lanterns])
  const lattice = useTiled(useMemo(makeLattice, []), 8, 3)
  const wood = useTiled(tex.wood, 3, 2), bark = useTiled(tex.bark, 4, 2), stone = useTiled(tex.stone, w / TILE, 0.3)
  // the walls stand 2.4 high on a 0.6 base, set back to leave a porch in front. The roof: an attic box turned 45°
  // whose top half is the gable over the walls, a slab on each slope running out past the walls into the eaves, and
  // all of it squashed to flatten the pitch
  const walls = { w: w - 1, d: d - 1.2, z: -0.3 }, porch = d / 2 - 0.25
  const a = walls.d / 2, slab = a * Math.SQRT2 + 1.6, along = slab / 2 / Math.SQRT2
  const red = <meshBasicMaterial color={RED} />, ink = <meshBasicMaterial color={INK} />
  return (
    <>
      <Boxes boxes={lanterns.stone} tex={tex.stone} />
      <Boxes boxes={lanterns.lit} tex={tex.lamp} />
      <group position={[x, 0, gate]}>
        {[-1, 1].map((s) => (
          <Fragment key={s}>
            <mesh position={[s * TORII, 2.2, 0]}><cylinderGeometry args={[0.16, 0.2, 4.4, 8]} />{red}</mesh>
            <mesh position={[s * TORII, 0.2, 0]}><cylinderGeometry args={[0.25, 0.25, 0.4, 8]} />{ink}</mesh>
          </Fragment>
        ))}
        <mesh position-y={3.5}><boxGeometry args={[5.4, 0.22, 0.18]} />{red}</mesh>
        <mesh position-y={4.3}><boxGeometry args={[6, 0.28, 0.36]} />{red}</mesh>
        <mesh position-y={4.52}><boxGeometry args={[6.5, 0.16, 0.46]} />{ink}</mesh>
        <mesh position-y={3.9}><boxGeometry args={[1.8, 0.45, 0.08]} />{ink}</mesh>
        <Text position={[0, 3.9, 0.05]} fontSize={0.15} {...TITLE}>TEMPLO DIGITAL</Text>
      </group>
      <group position={[x, 0, z]}>
        <mesh position-y={0.3}><boxGeometry args={[w, 0.6, d]} /><meshBasicMaterial map={stone} /></mesh>
        <mesh position={[0, 1.8, walls.z]}><boxGeometry args={[walls.w, 2.4, walls.d]} /><meshBasicMaterial map={wood} /></mesh>
        <mesh position={[0, 1.6, walls.z + a + 0.01]}><planeGeometry args={[walls.w - 1.2, 1.8]} /><meshBasicMaterial map={lattice} /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (w / 2 - 0.35), 1.55, porch]}><boxGeometry args={[0.22, 1.9, 0.22]} /><meshBasicMaterial map={wood} /></mesh>
        ))}
        <group position={[0, 3, walls.z]} scale-y={0.7}>
          <mesh rotation-x={Math.PI / 4}><boxGeometry args={[walls.w, a * Math.SQRT2, a * Math.SQRT2]} /><meshBasicMaterial map={wood} /></mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, a - along + 0.07, s * (along + 0.07)]} rotation-x={(s * Math.PI) / 4}>
              <boxGeometry args={[w + 0.4, 0.2, slab]} />
              <meshBasicMaterial map={bark} />
            </mesh>
          ))}
          <mesh position-y={a + 0.12}><boxGeometry args={[w + 0.6, 0.3, 0.3]} />{ink}</mesh>
        </group>
        {/* the straw rope between the posts with its paper streamers, the bell and its rope, the offering box */}
        <mesh position={[0, 2.25, porch + 0.1]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.09, 0.09, w - 0.9, 6]} /><meshBasicMaterial color={STRAW} /></mesh>
        {[-2.4, -1.2, 1.2, 2.4].map((sx) => (
          <mesh key={sx} position={[sx, 2, porch + 0.1]}><boxGeometry args={[0.1, 0.32, 0.02]} /><meshBasicMaterial color="#fff" /></mesh>
        ))}
        <mesh position={[0, 2.3, 1.45]}><sphereGeometry args={[0.17, 8, 6]} /><meshBasicMaterial color={GILT} /></mesh>
        <mesh position={[0, 1.6, 1.45]}><cylinderGeometry args={[0.04, 0.04, 1.2, 6]} />{red}</mesh>
        <mesh position={[0, 0.88, d / 2 - 0.3]}><boxGeometry args={[1.6, 0.55, 0.55]} /><meshBasicMaterial map={wood} /></mesh>
        <mesh position={[0, 1.18, d / 2 - 0.3]}><boxGeometry args={[1.64, 0.05, 0.59]} />{ink}</mesh>
      </group>
    </>
  )
}

// ---- exhibits ----

const MAX_W = 1.6, MAX_H = 1.2
const fit = (aspect: number): [number, number] => (aspect > MAX_W / MAX_H ? [MAX_W, MAX_W / aspect] : [MAX_H * aspect, MAX_H])

function ExhibitView({ ex, slot, quiet }: { ex: Exhibit; slot: Slot; quiet: boolean }) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation-y={slot.rot} userData={{ ex }}>
      {ex.kind === 'photo' ? <Photo ex={ex} /> : ex.kind === 'note' ? <Note text={ex.text} /> : <Media ex={ex} quiet={quiet} />}
      {ex.caption && <Text position={[0, 0.72, 0.01]} fontSize={0.14} maxWidth={MAX_W} textAlign="center" {...TITLE} color="#eee">{ex.caption}</Text>}
    </group>
  )
}

function Framed({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <group position-y={EYE}>
      {/* a light oak frame around a white mat, like in a gallery */}
      <mesh position-z={-0.02}>
        <planeGeometry args={[w + 0.28, h + 0.28]} />
        <meshBasicMaterial color="#b88a56" />
      </mesh>
      <mesh position-z={-0.01}>
        <planeGeometry args={[w + 0.2, h + 0.2]} />
        <meshBasicMaterial color="#f3f1ec" />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        {children}
      </mesh>
    </group>
  )
}

function Photo({ ex }: { ex: Exhibit }) {
  const tex = useTexture(fileUrl(ex, true))
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true }, [tex])
  const img = tex.image as HTMLImageElement
  const [w, h] = fit(img.width / img.height)
  return <Framed w={w} h={h}><meshBasicMaterial map={tex} /></Framed>
}

function Note({ text }: { text: string }) {
  return (
    <group position-y={EYE}>
      <mesh>
        <planeGeometry args={[1.2, 1]} />
        <meshBasicMaterial color="#e8dcb0" />
      </mesh>
      <Text position-z={0.01} fontSize={0.07} maxWidth={1.05} color="#222" clipRect={[-0.55, -0.45, 0.55, 0.45]}>{text}</Text>
    </group>
  )
}

// video and music play only when you are close, louder the closer you get
function Media({ ex, quiet }: { ex: Exhibit; quiet: boolean }) {
  const el = useMemo(() => {
    const m = document.createElement(ex.kind === 'video' ? 'video' : 'audio')
    Object.assign(m, { src: fileUrl(ex), loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'metadata' })
    return m
  }, [ex])
  const tex = useMemo(() => (el instanceof HTMLVideoElement ? new THREE.VideoTexture(el) : null), [el])
  const [aspect, setAspect] = useState(16 / 9)
  useEffect(() => {
    el.onloadedmetadata = () => el instanceof HTMLVideoElement && el.videoWidth && setAspect(el.videoWidth / el.videoHeight)
    return () => { el.pause(); el.removeAttribute('src'); el.load(); tex?.dispose() }
  }, [el, tex])

  const ref = useRef<THREE.Group>(null!)
  const playing = useRef(false)
  useFrame(({ camera }) => {
    const dist = camera.position.distanceTo(ref.current.getWorldPosition(tmp))
    const near = dist < 7 && !quiet
    el.volume = near ? 1 - dist / 7 : 0
    if (near === playing.current) return
    playing.current = near
    if (near) el.play().catch(() => (playing.current = false)) // blocked until the first click
    else el.pause()
  })

  const [w, h] = fit(aspect)
  return (
    <group ref={ref}>
      {tex ? <Framed w={w} h={h}><meshBasicMaterial map={tex} /></Framed> : (
        <group position-y={EYE}>
          <mesh><planeGeometry args={[0.8, 0.6]} /><meshBasicMaterial color="#222" /></mesh>
          <Text position-z={0.01} fontSize={0.35} color={GOLD}>♪</Text>
        </group>
      )}
    </group>
  )
}

// ---- player ----

const UP = new THREE.Vector3(0, 1, 0)
const CENTER = new THREE.Vector2(0, 0)
const R = 0.2 // body radius: small, so you can walk right up to walls and what hangs on them
const HEAD = 0.15 // how far the top of your head is above your eyes

function Player({ layouts, floor, view, onFloor, onElevator, onPick, onAct }: {
  layouts: Layout[]; floor: number; view: View; onFloor: (k: number) => void
  onElevator: (on: boolean) => void; onPick: (ex: Exhibit | null) => void; onAct: (a: Act | null) => void
}) {
  const { camera, scene } = useThree()
  const haze = useMemo(() => new THREE.Color(VIEWS[view].haze), [view])
  const keys = useRef<Record<string, boolean>>({})
  const jumpQueued = useRef(false)
  const verticalSpeed = useRef(0)
  const last = useRef<{ elevator?: boolean; pick?: Exhibit | null; act?: Act | null }>({})
  const ray = useMemo(() => new THREE.Raycaster(undefined, undefined, 0, 4), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  // The floor you're on. Riding an elevator changes it here and reports it up; when `floor` changes from outside
  // (the elevator buttons) while you're in a car, that car goes there. Arriving at the museum puts you in the
  // street; anything else that moves you between floors drops you in that floor's lobby.
  const fl = useRef(floor)
  const arrived = useRef(false)
  const inCar = () => liftShaft(camera.position.x, camera.position.z) // which car you're in, -1 for none
  // elevator sounds from Freedoom, louder the closer you are to the car
  const sound = useMemo(() => Object.fromEntries(['dsbdopn', 'dsbdcls', 'dspstart', 'dspstop', 'dsswtchn']
    .map((name) => [name, new Audio(`/doom/${name}.wav`)])), [])
  const play = (name: string, i: number) => {
    const p = camera.position, d = Math.hypot(p.x - LIFTS[i].x0 - TILE / 2, p.y - cars[i].at * WALL_H - EYE, p.z - LIFTS[i].z)
    const a = sound[name], volume = Math.min(1, Math.max(0, 1 - d / 20)) * 0.7
    if (volume === 0) return
    a.currentTime = 0
    a.volume = volume
    a.play().catch(() => {}) // blocked until the first click
  }
  // which way each car's doors went and whether it moved, last frame
  const was = useRef(LIFTS.map(() => ({ doors: 0, moving: false })))
  const spawn = (k: number) => {
    const s = arrived.current ? SPAWN : layouts[0].start
    arrived.current = true
    fl.current = k
    camera.position.set(s.x, k * WALL_H + EYE, s.z)
    camera.rotation.set(0, -Math.PI / 2, 0)
    verticalSpeed.current = 0
    jumpQueued.current = false
  }
  useEffect(() => {
    if (!arrived.current) spawn(floor)
    else if (floor !== fl.current) {
      // a button in the car: it goes there, and the HUD keeps showing the floor you're actually on
      const i = inCar()
      if (i >= 0) { cars[i].target = floor; play('dsswtchn', i); onFloor(fl.current) }
      else spawn(floor)
    }
  }, [floor])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) jumpQueued.current = true
      }
      keys.current[e.code] = true
    }
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false }
    const blur = () => { keys.current = {}; jumpQueued.current = false }
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur) }
  }, [])

  useFrame((_, dt) => {
    const k = keys.current, p = camera.position
    dt = Math.min(dt, 0.1)
    if (fl.current >= layouts.length) return spawn(layouts.length - 1) // floors were deleted under us
    const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
    if (turn) camera.rotateOnWorldAxis(UP, turn * 2.5 * dt)

    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
    const side = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const step = (k.ShiftLeft || k.ShiftRight ? 8 : 4) * dt
    const magnitude = Math.hypot(fwd, side) || 1
    const here = fl.current, l = layouts[here], riding = inCar(), calling = riding < 0 ? liftDoor(p.x, p.z) : -1
    // each car, like a real one: standing at its door calls it to your floor. To go anywhere it shuts its doors,
    // waits a beat, speeds up gently, slows down as it gets close, stops, waits a beat, and only then opens its
    // doors (while you're at them or inside)
    cars.forEach((car, i) => {
      car.target = Math.min(car.target, layouts.length - 1)
      if (calling === i) car.target = here
      const before = { doors: car.doors, at: car.at }
      car.still += dt
      if (car.at !== car.target) {
        if (car.doors > 0) {
          car.doors = Math.max(0, car.doors - dt * 1.5)
          car.still = 0
        } else if (car.still > 0.5) {
          const d = car.target - car.at, cruise = Math.min(2.5, Math.max(0.35, Math.abs(d) * 0.6))
          car.v = Math.min(cruise, car.v + dt * 1.2)
          if (Math.abs(d) <= car.v * dt) Object.assign(car, { at: car.target, v: 0, still: 0 })
          else car.at += Math.sign(d) * car.v * dt
        }
      } else if (car.still > 0.5) {
        const wanted = riding === i || (car.at === here && Math.hypot(p.x - LIFTS[i].x0, p.z - LIFTS[i].z) < 3)
        car.doors = THREE.MathUtils.clamp(car.doors + (wanted ? 1.5 : -1.5) * dt, 0, 1)
      }
      const doors = Math.sign(car.doors - before.doors), moving = car.at !== before.at
      if (doors && doors !== was.current[i].doors) play(doors > 0 ? 'dsbdopn' : 'dsbdcls', i)
      if (moving !== was.current[i].moving) play(moving ? 'dspstart' : 'dspstop', i)
      was.current[i] = { doors, moving }
    })

    // what stops you: walls, desk, fountain, the shafts of columns; the front door until it's mostly up; and the
    // cars, which you only get in or out of through their doorway once the doors are open, from the tile in front
    const open = (x: number, z: number) => {
      const shaft = liftShaft(x, z)
      if (shaft !== riding) {
        const i = Math.max(shaft, riding), car = cars[i], [ox, oz] = shaft >= 0 ? [p.x, p.z] : [x, z]
        return Math.min(shaft, riding) < 0 && car.at === here && car.doors >= 0.9 && liftDoor(ox, oz) === i &&
          Math.abs(z - LIFTS[i].z) < LIFTS[i].door / 2
      }
      if (shaft >= 0) return true
      if (l.door && Math.abs(x - l.door.x) < TILE / 2 && tileAt(l, x, z) === 'D' && frontDoor.open < 0.8) return false
      if (blockedByRoomDoor(l, x, z)) return false
      return !solidAt(l, x, z)
    }
    // what your head hits: lintels as high as a doorway's over doors, window bays and the car's doorway, the storey's
    // ceiling elsewhere indoors, nothing under the sky. The highest your eyes can go at (x, z), over your whole body.
    // shortcut: ignores the arcade's arches, whose undersides drop to SPRING by the columns; model them if jumps get higher
    const ceiling = (x: number, z: number) => {
      const c = tileAt(l, x, z)
      return 'DWE'.includes(c) ? DOOR_H : OUTDOOR.includes(c) ? Infinity : WALL_H
    }
    const feet = [[0, 0], [-R, -R], [R, -R], [-R, R], [R, R]]
    const headroom = (x: number, z: number) => here * WALL_H + Math.min(...feet.map(([a, b]) => ceiling(x + a, z + b))) - HEAD
    // mid-jump, a lintel stops you just like a wall does
    const free = (x: number, z: number) =>
      feet.every(([a, b]) => open(x + a, z + b)) && (riding >= 0 || p.y <= headroom(x, z))
    const nx = p.x + (dir.x * fwd - dir.z * side) / magnitude * step
    const nz = p.z + (dir.z * fwd + dir.x * side) / magnitude * step
    const walk = (axis: 'x' | 'z', delta: number) => {
      const count = Math.max(1, Math.ceil(Math.abs(delta) / (R / 2)))
      const increment = delta / count
      for (let i = 0; i < count; i++) {
        const x = axis === 'x' ? p.x + increment : p.x
        const z = axis === 'z' ? p.z + increment : p.z
        if (!free(x, z)) break
        if (axis === 'x') p.x = x
        else p.z = z
      }
    }
    walk('x', nx - p.x)
    walk('z', nz - p.z)

    // riding, you go wherever the car goes and the floor counts up as you pass them
    if (riding >= 0) {
      const car = cars[riding], passing = Math.round(car.at)
      if (passing !== here) onFloor((fl.current = passing))
      p.y = car.at * WALL_H + EYE
      verticalSpeed.current = 0
      jumpQueued.current = false
    } else {
      if (solidAt(l, p.x, p.z)) return spawn(here) // the map changed under us
      const ground = here * WALL_H + EYE
      if (jumpQueued.current && p.y <= ground + 0.001 && verticalSpeed.current === 0) verticalSpeed.current = 5.5
      jumpQueued.current = false
      verticalSpeed.current -= 16 * dt
      p.y += verticalSpeed.current * dt
      const top = headroom(p.x, p.z)
      if (p.y > top) { // bumped your head: stop rising and fall from there
        p.y = top
        verticalSpeed.current = Math.min(0, verticalSpeed.current)
      }
      if (p.y <= ground) {
        p.y = ground
        verticalSpeed.current = 0
      }
    }
    const f = fl.current
    const at = (x: number, z: number) => tileAt(layouts[f], x, z)
    const elevator = inCar() >= 0
    if (elevator !== last.current.elevator) onElevator((last.current.elevator = elevator))

    // outside the fog turns into a light haze, and so it does at a window, where you look out; inside it's Doom
    // darkness, kept far enough that the sunny courtyard doesn't look like night from the corridors around it. How
    // far each reaches is the chosen view's
    const atWindow = [[0, 0], ...SIDES].some(([a, b]) => at(p.x + a * TILE, p.z + b * TILE) === 'W')
    const v = VIEWS[view], out = OUTDOOR.includes(at(p.x, p.z)) || atWindow, fog = scene.fog as THREE.Fog, lerp = Math.min(1, dt * 3)
    const [near, far] = out ? v.out : v.in
    fog.color.lerp(out ? haze : DARK, lerp)
    fog.near += (near - fog.near) * lerp
    fog.far += (far - fog.far) * lerp
    if (camera.far !== v.far) {
      camera.far = v.far
      camera.updateProjectionMatrix()
    }

    // what the crosshair points at; walls block it
    ray.setFromCamera(CENTER, camera)
    const targets = ['exhibits', 'walls'].map((n) => scene.getObjectByName(n)).filter((o) => !!o)
    let ex: Exhibit | null = null, act: Act | null = null
    for (let o: THREE.Object3D | null = ray.intersectObjects(targets, true)[0]?.object ?? null; o; o = o.parent) {
      if (o.userData.ex) { ex = o.userData.ex; break }
      if (o.userData.act) { act = o.userData.act; break }
    }
    if (act?.kind === 'pin' && isUnlocked(act.room)) act = null // already open: nothing to type
    if (ex !== last.current.pick) onPick((last.current.pick = ex))
    if (act?.kind !== last.current.act?.kind || act?.room !== last.current.act?.room) onAct((last.current.act = act))
  })
  return null
}

// ---- other visitors ----

type Peer = { n: string; f: string; x: number; z: number; y: number; h: number; t: number }
// Freedoom marine: frames a-d (walk cycle) x rotations 1-5; 6-8 are 4-2 mirrored
const SPRITES = [...'abcd'].flatMap((f) => [`${f}1`, `${f}2${f}8`, `${f}3${f}7`, `${f}4${f}6`, `${f}5`].map((r) => `/doom/play${r}.png`))
const PX = 1.8 / 56 // sprite pixels to meters: the marine is 56px tall

// the same socket carries other visitors' positions, chat, and the server's "museum changed" pushes
function Avatars({ floorId, token, onChanged, onChat, say }: Pick<Props, 'token' | 'onChanged' | 'onChat' | 'say'> & { floorId: string }) {
  const peers = useRef(new Map<number, Peer>())
  const [ids, setIds] = useState<number[]>([])
  const ws = useRef<WebSocket | null>(null)
  const tex = useTexture(SPRITES)
  useMemo(() => tex.forEach((t) => retro(t)), [tex])

  useEffect(() => {
    let sock: WebSocket, retry: ReturnType<typeof setTimeout>, alive = true, opened = false
    const sync = () => {
      const next = [...peers.current.keys()]
      setIds((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next))
    }
    const connect = () => {
      sock = ws.current = new WebSocket(LIVE_URL)
      say.current = (text) => { if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ chat: text })) }
      sock.onopen = () => {
        sock.send(JSON.stringify({ token }))
        if (opened) onChanged() // reconnected: we may have missed changes
        opened = true
      }
      sock.onmessage = (e) => {
        const m = JSON.parse(e.data)
        if (m.t === 'changed') return onChanged()
        if (m.chat) return onChat(m)
        if (m.bye) peers.current.delete(m.id)
        else peers.current.set(m.id, { ...m, t: performance.now() })
        sync()
      }
      sock.onclose = () => {
        peers.current.clear()
        sync()
        if (alive) retry = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { alive = false; clearTimeout(retry); sock.close() }
  }, [token, onChanged, onChat, say])

  const since = useRef(0)
  useFrame(({ camera }, dt) => {
    if ((since.current += dt) < 0.1 || ws.current?.readyState !== WebSocket.OPEN) return
    since.current = 0
    camera.getWorldDirection(tmp)
    const { x, y, z } = camera.position
    ws.current.send(JSON.stringify({ f: floorId, x, z, y: Math.atan2(-tmp.x, -tmp.z), h: y - EYE }))
  })

  return <>{ids.map((id) => <Avatar key={id} peer={() => peers.current.get(id)} tex={tex} />)}</>
}

// everyone is drawn at their own height, so you can wave at a friend on a balcony across the courtyard
function Avatar({ peer, tex }: { peer: () => Peer | undefined; tex: THREE.Texture[] }) {
  const g = useRef<THREE.Group>(null!)
  const sprite = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!)
  useFrame(({ camera, clock }) => {
    const p = peer()
    g.current.visible = !!p && performance.now() - p.t < 5000
    if (!p || !g.current.visible) return
    const pos = g.current.position, h = p.h ?? 0
    if (!g.current.userData.seen) { pos.set(p.x, h, p.z); g.current.userData.seen = true }
    const moving = Math.hypot(p.x - pos.x, p.z - pos.z) > 0.05
    pos.x += (p.x - pos.x) * 0.2
    pos.y += (h - pos.y) * 0.2
    pos.z += (p.z - pos.z) * 0.2

    // face the camera, then pick the rotation sprite from where the camera stands relative to their facing
    const vx = camera.position.x - pos.x, vz = camera.position.z - pos.z
    g.current.rotation.y = Math.atan2(vx, vz)
    const rot = ((Math.round((Math.atan2(-vx, -vz) - p.y) / (Math.PI / 4)) % 8) + 8) % 8 + 1
    const frame = moving ? Math.floor(clock.elapsedTime * 6) % 4 : 0
    const t = tex[frame * 5 + (rot <= 5 ? rot - 1 : 9 - rot)]
    const img = t.image as HTMLImageElement
    const w = img.width * PX, sh = img.height * PX
    sprite.current.material.map = t
    sprite.current.scale.set(rot > 5 ? -w : w, sh, 1)
    sprite.current.position.y = sh / 2
  })
  return (
    <group ref={g} visible={false}>
      <mesh ref={sprite}>
        <planeGeometry />
        <meshBasicMaterial transparent alphaTest={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Text position-y={2.1} fontSize={0.18} color="#fff" outlineWidth={0.012} outlineColor="#000">{peer()?.n ?? ''}</Text>
    </group>
  )
}
