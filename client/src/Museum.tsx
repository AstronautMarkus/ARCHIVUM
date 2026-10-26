import { Fragment, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls, Text, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import {
  atLiftDoor, buildBuilding, solidAt, tileAt, DOOR_H, LIFT, SPAWN, STREET_X, TILE, WALL_H, type Layout, type Prop, type Slot,
} from './layout'
import { fileUrl, type Exhibit, type Floor, type Museum } from './api'

const EYE = 1.6
const GOLD = '#ffcc33'
const HAZE = '#9fd0f5' // sky at the horizon; outdoor fog fades into it
const HAZE_COLOR = new THREE.Color(HAZE), DARK = new THREE.Color('#000')
const STOREY = WALL_H // one floor seen from outside
// storeys of the city buildings around the street, changing every three tiles
const CITY = [3, 4, 2, 5, 3]
const buildingHeight = (tx: number, tz: number) => CITY[((Math.floor((tx + tz) / 3) % 5) + 5) % 5] * STOREY + 0.5
const odd = ([tx, tz]: readonly number[]) => ((tx + tz) % 2 + 2) % 2 === 1 // which wall tiles get a window
const tmp = new THREE.Vector3()

function retro(t: THREE.Texture, repeat = false) {
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
}

// a pixelated copy of a texture repeating rx times across and ry times up (negative mirrors it)
function useTiled(tex: THREE.Texture, rx = 1, ry = 1) {
  return useMemo(() => {
    const t = tex.clone()
    retro(t, true)
    t.repeat.set(rx, ry)
    return t
  }, [tex, rx, ry])
}

// titles: gold with a black outline so they read on any wall
const TITLE = { color: GOLD, outlineWidth: '8%', outlineColor: '#000' }

type Props = {
  museum: Museum; floor: number; token: string; quiet: boolean
  onFloor: (k: number) => void; onElevator: (on: boolean) => void; onPick: (ex: Exhibit | null) => void
  onLock: (locked: boolean) => void; onChanged: () => void; onChat: (m: Chat) => void; say: RefObject<(text: string) => void>
}
export type Chat = { id: number; n: string; chat: string }

// the whole building in one scene; `floor` is where you stand, kept in sync both ways with stairs and elevator
export function MuseumView({ museum, floor, token, quiet, onFloor, onElevator, onPick, onLock, onChanged, onChat, say }: Props) {
  const byRoom = Map.groupBy(museum.exhibits, (e) => e.room)
  const floors = museum.floors.map((f: Floor) => museum.rooms.filter((r) => r.floor === f.id)
    .map((r) => ({ id: r.id, title: r.title, count: byRoom.get(r.id)?.length ?? 0 })))
  const key = JSON.stringify(floors)
  const layouts = useMemo(() => buildBuilding(floors), [key])
  const sky = useMemo(makeSky, [])
  return (
    // render at ~240 lines and let CSS scale it up with hard pixels
    <Canvas flat dpr={Math.min(1, 240 / window.innerHeight)} camera={{ fov: 75, near: 0.05, far: 80 }}>
      <primitive attach="background" object={sky} />
      <fog attach="fog" args={['#000', 3, 24]} />
      <Suspense fallback={null}>
        <World layouts={layouts} byRoom={byRoom} quiet={quiet} current={floor} />
        <Avatars floorId={museum.floors[floor]?.id ?? ''} token={token} onChanged={onChanged} onChat={onChat} say={say} />
      </Suspense>
      <Player layouts={layouts} floor={floor} onFloor={onFloor} onElevator={onElevator} onPick={onPick} />
      <PointerLockControls selector="#lock" onLock={() => onLock(true)} onUnlock={() => onLock(false)} />
    </Canvas>
  )
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
const OUTDOOR = 'ogp' // tiles under the open sky

// The structure of every floor is batched by kind into a few instanced meshes, so 3 floors or 99 cost about the
// same draw calls. Exhibits, signs and media, the heavy part, exist only for your floor and the ones next to it.
function World({ layouts, byRoom, quiet, current }: {
  layouts: Layout[]; byRoom: Map<string, Exhibit[]>; quiet: boolean; current: number
}) {
  const [wall, parquet, ceil, lite, facade, house, street, sidewalk, door, lobby, grass, wood, metal, panel, plate, steel, ...water] = useTexture([
    '/doom/bigwall.png', '/doom/floor0_1.png', '/doom/ceil3_5.png', '/doom/tlite6_1.png',
    '/doom/stonew5.png', '/doom/pbrick8.png', '/doom/asphalt.png', '/doom/pston2.png', '/doom/door9_1.png',
    '/doom/flat18.png', '/doom/grass1.png', '/doom/wood.png', '/doom/door2_5.png',
    '/doom/aqpanl08.png', '/doom/aqpanl05.png', '/doom/flat23.png',
    '/doom/fwater1.png', '/doom/fwater2.png', '/doom/fwater3.png', '/doom/fwater4.png',
  ])
  useMemo(() => water.forEach((t) => retro(t)), [water])
  const [facadeWin, brickWin] = useMemo(() => [withWindow(facade), withWindow(house)], [facade, house])
  const ground = layouts[0]
  const top = layouts.length * STOREY + 0.9 // the museum is as tall as its floors, plus a parapet
  const near = (k: number) => Math.abs(k - current) <= 1

  // sort every tile of every floor into what gets drawn there
  const t = useMemo(() => {
    const t = {
      inner: [] as Cell[], front: [] as Cell[], houses: [] as Cell[], doors: [] as Cell[], columns: [] as Cell[],
      rails: [] as Box[], desk: [] as Cell[], parquet: [] as Cell[],
      lobby: [] as Cell[], grass: [] as Cell[], path: [] as Cell[], street: [] as Cell[], sidewalk: [] as Cell[],
      ceiling: [] as Cell[],
    }
    layouts.forEach((layout, k) => {
      const y = k * STOREY
      const at = (tx: number, tz: number) => tileAt(layout, (tx + 0.5) * TILE, (tz + 0.5) * TILE)
      layout.rows.forEach((row, i) => [...row].forEach((c, j) => {
        const tx = j + layout.x0, tz = i + layout.z0, cell: Cell = [tx, tz, y]
        if (c === '#') {
          // walls touching the street are city buildings, or the museum facade on its west face (x = 0)
          const nb = [at(tx + 1, tz), at(tx - 1, tz), at(tx, tz + 1), at(tx, tz - 1)]
          if (nb.includes('o')) (tx === 0 ? t.front : t.houses).push(cell)
          else if (nb.some((n) => n !== '#')) t.inner.push(cell)
        } else if (c === 'o') (STREET_X > (tx + 0.5) * TILE ? t.street : t.sidewalk).push(cell)
        else if (c === 'g' || c === 'F') t.grass.push(cell)
        else if (c === 'p') t.path.push(cell)
        else if (c !== 'v' && c !== 'E') { // the courtyard and the elevator shaft stay open all the way up
          t.ceiling.push(cell)
          ;(c === 'L' ? t.lobby : t.parquet).push(cell)
          if (c === 'D') t.doors.push(cell)
          if (c === 'C') t.columns.push(cell)
          // a thin railing along the courtyard edge, running past the columns and a bit beyond each tile so the
          // pieces meet without gaps
          if (c === 'B' || c === 'C') {
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (at(tx + a, tz + b) !== 'v') continue
              t.rails.push([(tx + 0.5 + a * 0.47) * TILE, y + 0.5, (tz + 0.5 + b * 0.47) * TILE,
                a ? 0.12 : TILE + 0.2, 1, b ? 0.12 : TILE + 0.2])
            }
          }
          if (c === 'R') t.desk.push(cell)
        }
      }))
    })
    // above the ground floor the facade is a thin skin outside the upper floors' own walls, so inside you see
    // your floor's wall and outside the windows; only every other tile gets one
    const h = top - STOREY
    const skin = (cells: Cell[]): Box[] => cells.map(([tx, tz]) => [-0.1, STOREY + h / 2, (tz + 0.5) * TILE, 0.2, h, TILE])
    const above = [...t.front, ...t.doors.filter(([tx, , y]) => tx === 0 && y === 0)]
    const upper = { win: skin(above.filter(odd)), plain: skin(above.filter((c) => !odd(c))), h }
    const city = [...Map.groupBy(t.houses, ([tx, tz]) => buildingHeight(tx, tz))]
      .map(([h, cells]) => ({ h, win: cells.filter(odd), plain: cells.filter((c) => !odd(c)) }))
    const deskZ = t.desk.reduce((s, [, tz]) => s + (tz + 0.5) * TILE, 0) / (t.desk.length || 1)
    return { ...t, upper, city, deskZ }
  }, [layouts, top])

  return (
    <>
      <group name="walls">
        <WallSet cells={t.inner} tex={wall} height={WALL_H} />
        <WallSet cells={t.front} tex={facade} height={STOREY} every={STOREY} />
        <Boxes boxes={t.upper.win} tex={facadeWin} repeat={[1, t.upper.h / STOREY]} />
        <Boxes boxes={t.upper.plain} tex={facade} repeat={[1, t.upper.h / STOREY]} />
        {t.city.map(({ h, win, plain }) => (
          <Fragment key={h}>
            <WallSet cells={win} tex={brickWin} height={h} every={STOREY} />
            <WallSet cells={plain} tex={house} height={h} every={STOREY} />
          </Fragment>
        ))}
        <WallSet cells={t.columns} tex={facade} height={WALL_H} size={0.7} />
        <Boxes boxes={t.rails} tex={facade} />
        <WallSet cells={t.desk} tex={wood} height={1.1} every={1.1} />
      </group>
      <TileSet cells={t.parquet} tex={parquet} />
      <TileSet cells={t.lobby} tex={lobby} />
      <TileSet cells={t.grass} tex={grass} />
      <TileSet cells={t.path} tex={sidewalk} />
      <TileSet cells={t.street} tex={street} />
      <TileSet cells={t.sidewalk} tex={sidewalk} />
      <TileSet cells={t.ceiling} tex={ceil} y={WALL_H - 0.005} />
      {t.doors.map(([tx, tz, y]) => tx === 0 && y === 0
        ? <Lintel key={`${tx},${tz},${y}`} tx={tx} tz={tz} y={y} tex={facade} top={STOREY} />
        : <Lintel key={`${tx},${tz},${y}`} tx={tx} tz={tz} y={y} tex={wall} top={WALL_H} />)}
      {ground.door && (
        <>
          <Text position={[-0.05, (DOOR_H + STOREY) / 2, ground.door.z]} rotation-y={-Math.PI / 2} fontSize={0.9} {...TITLE}>ARCHIVUM</Text>
          <FrontDoor at={ground.door} tex={door} />
        </>
      )}
      {t.desk.length > 0 && (
        <Text position={[TILE + 0.03, 2.2, t.deskZ]} rotation-y={Math.PI / 2} fontSize={0.6} {...TITLE}>RECEPCIÓN</Text>
      )}
      {ground.court && (
        <>
          <Fountain at={ground.court.fountain} stone={facade} water={water} />
          <Petals court={ground.court} />
        </>
      )}
      <Props props={ground.props} />
      <Elevator floors={layouts.length} near={near} tex={{ stone: facade, metal, lamp: lite, panel, plate, steel }} />
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
// `every` meters up
function WallSet({ cells, tex, height, base = 0, every = TILE, size = TILE }: {
  cells: Cell[]; tex: THREE.Texture; height: number; base?: number; every?: number; size?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const map = useTiled(tex, 1, height / every)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach(([tx, tz, y], i) => ref.current.setMatrixAt(i, m.makeTranslation((tx + 0.5) * TILE, y + base + height / 2, (tz + 0.5) * TILE)))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [cells, height, base])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
      <boxGeometry args={[size, height, size]} />
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

// one textured square per tile, y above its floor: a floor, or a ceiling facing down when y is high up
function TileSet({ cells, tex, y = 0 }: { cells: Cell[]; tex: THREE.Texture; y?: number }) {
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

// The elevator: a glass shaft on the courtyard's west edge, with a car that really travels it. Player drives the
// car (you call it from its door, ride it, pick a floor); this only draws it.
// shortcut: each visitor has their own car, so a friend riding theirs seems to float up the shaft on your screen
// at: floor it's at (fractional while moving); target: floor it's going to; doors: 0 shut .. 1 open;
// v: speed in floors per second; still: seconds since it shut its doors or arrived, for the pauses in between
const car = { at: 0, target: 0, doors: 0, v: 0, still: 1 }
const GLASS = { color: HAZE, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }

type LiftTextures = Record<'stone' | 'metal' | 'lamp' | 'panel' | 'plate' | 'steel', THREE.Texture>

function Elevator({ floors, near, tex }: { floors: number; near: (k: number) => boolean; tex: LiftTextures }) {
  const { x0, z, w, door } = LIFT, cx = x0 + TILE / 2, H = floors * STOREY
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

// instanced boxes placed and sized one by one: railings, stairs, the facade skin
function Boxes({ boxes, tex, repeat = [1, 1] }: { boxes: Box[]; tex: THREE.Texture; repeat?: [number, number] }) {
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
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

function Lintel({ tx, tz, y, tex, top }: { tx: number; tz: number; y: number; tex: THREE.Texture; top: number }) {
  const map = useTiled(tex, 1, (top - DOOR_H) / TILE)
  return (
    <mesh position={[(tx + 0.5) * TILE, y + (DOOR_H + top) / 2, (tz + 0.5) * TILE]}>
      <boxGeometry args={[TILE, top - DOOR_H, TILE]} />
      <meshBasicMaterial map={map} />
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
    ref.current.position.y = DOOR_H / 2 + frontDoor.open * DOOR_H
  })
  return (
    <mesh ref={ref} position={[at.x, DOOR_H / 2, at.z]}>
      <boxGeometry args={[0.25, DOOR_H, at.w]} />
      <meshBasicMaterial map={map} />
    </mesh>
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

// pixel-art cherry tree, drawn once: a trunk with three branches under a cloud of pink blossom squares
function makeSakura() {
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
  const pinks = ['#e98aab', '#f4a7c0', '#f7c6d9', '#fbe0ea']
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 27
    g.fillStyle = pinks[Math.min(3, Math.floor(rand() * 2 + (Math.sin(a) < 0 ? 2 : 0)))] // lighter on top
    g.fillRect(Math.round(32 + Math.cos(a) * r * 1.1), Math.round(24 + Math.sin(a) * r * 0.75), 3, 3)
  }
  return new THREE.CanvasTexture(c)
}

// shortcut: props are walk-through; mark their tiles solid if people start hiding inside trees
function Props({ props }: { props: Prop[] }) {
  const sakura = useMemo(makeSakura, [])
  const art = { tree: useTexture('/doom/smita0.png'), lamp: useTexture('/doom/tlmpa0.png'), sakura }
  useMemo(() => { retro(art.tree); retro(art.lamp); retro(art.sakura) }, [art.tree, art.lamp, art.sakura])
  const scale = { tree: 1.6, lamp: 1, sakura: 1.75 } // trees a bit bigger than Doom size so they read as trees
  // upright billboards like in Doom: they turn toward you around the vertical axis only, so looking down
  // doesn't tilt them off the ground
  const meshes = useRef<THREE.Mesh[]>([])
  useFrame(({ camera }) => meshes.current.forEach((m) => {
    m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z)
  }))
  return props.map((p, i) => {
    const img = art[p.kind].image as HTMLImageElement, s = PX * scale[p.kind]
    return (
      <mesh key={i} ref={(m) => { if (m) meshes.current[i] = m }}
        position={[p.x, (img.height * s) / 2, p.z]} scale={[img.width * s, img.height * s, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={art[p.kind]} alphaTest={0.5} />
      </mesh>
    )
  })
}

// ---- exhibits ----

const MAX_W = 1.6, MAX_H = 1.2
const fit = (aspect: number): [number, number] => (aspect > MAX_W / MAX_H ? [MAX_W, MAX_W / aspect] : [MAX_H * aspect, MAX_H])

function ExhibitView({ ex, slot, quiet }: { ex: Exhibit; slot: Slot; quiet: boolean }) {
  return (
    <group position={[slot.x, 0, slot.z]} rotation-y={slot.rot} userData={{ ex }}>
      {ex.kind === 'photo' ? <Photo ex={ex} /> : ex.kind === 'note' ? <Note text={ex.text} /> : <Media ex={ex} quiet={quiet} />}
      {ex.caption && <Text position={[0, 0.8, 0.01]} fontSize={0.14} maxWidth={MAX_W} textAlign="center" {...TITLE} color="#eee">{ex.caption}</Text>}
    </group>
  )
}

function Framed({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <group position-y={EYE}>
      <mesh position-z={-0.01}>
        <planeGeometry args={[w + 0.12, h + 0.12]} />
        <meshBasicMaterial color="#3a2a14" />
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

function Player({ layouts, floor, onFloor, onElevator, onPick }: {
  layouts: Layout[]; floor: number; onFloor: (k: number) => void
  onElevator: (on: boolean) => void; onPick: (ex: Exhibit | null) => void
}) {
  const { camera, scene } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const last = useRef<{ elevator?: boolean; pick?: Exhibit | null }>({})
  const ray = useMemo(() => new THREE.Raycaster(undefined, undefined, 0, 4), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  // The floor you're on. Riding the elevator changes it here and reports it up; when `floor` changes from outside
  // (the elevator buttons) while you're in the car, the car goes there. Arriving at the museum puts you in the
  // street; anything else that moves you between floors drops you in that floor's lobby.
  const fl = useRef(floor)
  const arrived = useRef(false)
  const inCar = () => tileAt(layouts[0], camera.position.x, camera.position.z) === 'E' // same shaft on every floor
  // elevator sounds from Freedoom, louder the closer you are to the car
  const sound = useMemo(() => Object.fromEntries(['dsbdopn', 'dsbdcls', 'dspstart', 'dspstop', 'dsswtchn']
    .map((name) => [name, new Audio(`/doom/${name}.wav`)])), [])
  const play = (name: string) => {
    const p = camera.position, d = Math.hypot(p.x - LIFT.x0 - TILE / 2, p.y - car.at * WALL_H - EYE, p.z - LIFT.z)
    const a = sound[name], volume = Math.min(1, Math.max(0, 1 - d / 20)) * 0.7
    if (volume === 0) return
    a.currentTime = 0
    a.volume = volume
    a.play().catch(() => {}) // blocked until the first click
  }
  const was = useRef({ doors: 0, moving: false }) // which way the doors went and whether the car moved, last frame
  const spawn = (k: number) => {
    const s = arrived.current ? SPAWN : layouts[0].start
    arrived.current = true
    fl.current = k
    camera.position.set(s.x, k * WALL_H + EYE, s.z)
    camera.rotation.set(0, -Math.PI / 2, 0)
  }
  useEffect(() => {
    if (!arrived.current) spawn(floor)
    else if (floor !== fl.current) {
      // a button in the car: it goes there, and the HUD keeps showing the floor you're actually on
      if (inCar()) { car.target = floor; play('dsswtchn'); onFloor(fl.current) }
      else spawn(floor)
    }
  }, [floor])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) keys.current[e.code] = true
    }
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false }
    const blur = () => { keys.current = {} }
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
    const here = fl.current, l = layouts[here], riding = inCar()
    car.target = Math.min(car.target, layouts.length - 1)
    // the car, like a real one: standing at its door calls it to your floor. To go anywhere it shuts its doors,
    // waits a beat, speeds up gently, slows down as it gets close, stops, waits a beat, and only then opens its
    // doors (while you're at them or inside)
    if (!riding && atLiftDoor(p.x, p.z)) car.target = here
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
      const wanted = riding || (car.at === here && Math.hypot(p.x - LIFT.x0, p.z - LIFT.z) < 3)
      car.doors = THREE.MathUtils.clamp(car.doors + (wanted ? 1.5 : -1.5) * dt, 0, 1)
    }
    const doors = Math.sign(car.doors - before.doors), moving = car.at !== before.at
    if (doors && doors !== was.current.doors) play(doors > 0 ? 'dsbdopn' : 'dsbdcls')
    if (moving !== was.current.moving) play(moving ? 'dspstart' : 'dspstop')
    was.current = { doors, moving }

    // what stops you: walls, desk, fountain, the shafts of columns; the front door until it's mostly up; and the
    // car, which you only get in or out of through its doorway once the doors are open, from the tile in front
    const open = (x: number, z: number) => {
      const inside = tileAt(l, x, z) === 'E'
      if (inside !== riding) {
        const [ox, oz] = inside ? [p.x, p.z] : [x, z]
        return car.at === here && car.doors >= 0.9 && atLiftDoor(ox, oz) && Math.abs(z - LIFT.z) < LIFT.door / 2
      }
      if (inside) return true
      if (here === 0 && x < TILE && tileAt(l, x, z) === 'D' && frontDoor.open < 0.8) return false
      return !solidAt(l, x, z)
    }
    const free = (x: number, z: number) => [[-R, -R], [R, -R], [-R, R], [R, R]].every(([a, b]) => open(x + a, z + b))
    const nx = p.x + (dir.x * fwd - dir.z * side) * step
    const nz = p.z + (dir.z * fwd + dir.x * side) * step
    if (free(nx, p.z)) p.x = nx
    if (free(p.x, nz)) p.z = nz

    // riding, you go wherever the car goes and the floor counts up as you pass them
    if (riding) {
      const passing = Math.round(car.at)
      if (passing !== here) onFloor((fl.current = passing))
      p.y = car.at * WALL_H + EYE
    } else {
      if (solidAt(l, p.x, p.z)) return spawn(here) // the map changed under us
      p.y += (here * WALL_H + EYE - p.y) * Math.min(1, dt * 12)
    }
    const f = fl.current
    const at = (x: number, z: number) => tileAt(layouts[f], x, z)
    const elevator = inCar()
    if (elevator !== last.current.elevator) onElevator((last.current.elevator = elevator))

    // outside the fog turns into a light haze; inside it's Doom darkness, kept far enough that the sunny
    // courtyard doesn't look like night from the corridors around it
    const out = OUTDOOR.includes(at(p.x, p.z)), fog = scene.fog as THREE.Fog, lerp = Math.min(1, dt * 3)
    const [near, far] = out ? [25, 70] : [12, 55]
    fog.color.lerp(out ? HAZE_COLOR : DARK, lerp)
    fog.near += (near - fog.near) * lerp
    fog.far += (far - fog.far) * lerp

    // what the crosshair points at; walls block it
    ray.setFromCamera(CENTER, camera)
    const targets = ['exhibits', 'walls'].map((n) => scene.getObjectByName(n)).filter((o) => !!o)
    let ex: Exhibit | null = null
    for (let o: THREE.Object3D | null = ray.intersectObjects(targets, true)[0]?.object ?? null; o; o = o.parent) {
      if (o.userData.ex) { ex = o.userData.ex; break }
    }
    if (ex !== last.current.pick) onPick((last.current.pick = ex))
  })
  return null
}

// ---- other visitors ----

type Peer = { n: string; f: string; x: number; z: number; y: number; h: number; t: number }
const LIVE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
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
      sock = ws.current = new WebSocket(LIVE)
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
