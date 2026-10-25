import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls, Text, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import {
  buildFloor, tileAt, DOOR_H, FACADE_H, HOUSE_H, SPAWN, STREET_X, TILE, WALL_H, type Layout, type Prop, type Slot,
} from './layout'
import { fileUrl, type Exhibit, type Floor, type Museum } from './api'

const EYE = 1.6
const GOLD = '#ffcc33'
const HAZE = '#9fd0f5' // sky at the horizon; outdoor fog fades into it
const HAZE_COLOR = new THREE.Color(HAZE), DARK = new THREE.Color('#000')
const tmp = new THREE.Vector3()

function retro(t: THREE.Texture, repeat = false) {
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
}

type Props = {
  museum: Museum; floor: Floor; token: string; quiet: boolean
  onElevator: (on: boolean) => void; onPick: (ex: Exhibit | null) => void; onLock: (locked: boolean) => void
  onChanged: () => void; onChat: (m: Chat) => void; say: RefObject<(text: string) => void>
}
export type Chat = { id: number; n: string; chat: string }

export function MuseumView({ museum, floor, token, quiet, onElevator, onPick, onLock, onChanged, onChat, say }: Props) {
  const rooms = museum.rooms.filter((r) => r.floor === floor.id)
  const byRoom = Map.groupBy(museum.exhibits, (e) => e.room)
  const ground = museum.floors[0]?.id === floor.id // only the ground floor opens onto the street
  const key = floor.id + rooms.map((r) => `${r.id}:${r.title}:${byRoom.get(r.id)?.length ?? 0}`).join()
  const layout = useMemo(
    () => buildFloor(rooms.map((r) => ({ id: r.id, title: r.title, count: byRoom.get(r.id)?.length ?? 0 })), ground),
    [key, ground],
  )
  const sky = useMemo(makeSky, [])
  return (
    // render at ~240 lines and let CSS scale it up with hard pixels
    <Canvas flat dpr={Math.min(1, 240 / window.innerHeight)} camera={{ fov: 75, near: 0.05, far: 80 }}>
      <primitive attach="background" object={sky} />
      <fog attach="fog" args={['#000', 3, 24]} />
      <Suspense fallback={null}>
        <World layout={layout} byRoom={byRoom} quiet={quiet} />
        <Avatars floorId={floor.id} token={token} onChanged={onChanged} onChat={onChat} say={say} />
      </Suspense>
      <Player layout={layout} floorId={floor.id} onElevator={onElevator} onPick={onPick} />
      <PointerLockControls selector="#lock" onLock={() => onLock(true)} onUnlock={() => onLock(false)} />
    </Canvas>
  )
}

// pixel-art day sky as an equirectangular background: blue gradient with chunky clouds
function makeSky() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 128) // zenith to horizon
  grad.addColorStop(0, '#1b4aa0')
  grad.addColorStop(1, HAZE)
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = HAZE
  g.fillRect(0, 128, 512, 128)
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 // fixed seed: everyone sees the same clouds
  for (let i = 0; i < 24; i++) {
    const x = rand() * 512, y = 40 + rand() * 70, r = 3 + rand() * 6
    for (let k = 0; k < 7; k++) {
      const bx = x + (rand() - 0.5) * r * 5, by = y + (rand() - 0.5) * r
      g.fillStyle = k < 2 ? '#d5e6f5' : '#ffffff'
      for (const wrap of [-512, 0, 512]) {
        g.beginPath()
        g.ellipse(bx + wrap, by, r * 1.8, r, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

type Cell = [number, number]

function World({ layout, byRoom, quiet }: { layout: Layout; byRoom: Map<string, Exhibit[]>; quiet: boolean }) {
  const [wall, floor, ceil, lite, facade, house, street, sidewalk, door] = useTexture([
    '/doom/bigwall.png', '/doom/floor0_1.png', '/doom/ceil3_5.png', '/doom/tlite6_1.png',
    '/doom/stonew5.png', '/doom/pbrick8.png', '/doom/asphalt.png', '/doom/pston2.png', '/doom/door9_1.png',
  ])
  useMemo(() => retro(lite), [lite])

  // walls touching the outside are house fronts, or the museum facade on the building's west face (x = 0)
  const { inner, front, houses, doors } = useMemo(() => {
    const inner: Cell[] = [], front: Cell[] = [], houses: Cell[] = [], doors: Cell[] = []
    const at = (tx: number, tz: number) => tileAt(layout, (tx + 0.5) * TILE, (tz + 0.5) * TILE)
    layout.rows.forEach((row, i) => [...row].forEach((c, j) => {
      const tx = j + layout.x0, tz = i + layout.z0
      if (c === 'D') doors.push([tx, tz])
      if (c !== '#') return
      const near = [at(tx + 1, tz), at(tx - 1, tz), at(tx, tz + 1), at(tx, tz - 1)]
      if (near.includes('o')) (tx === 0 ? front : houses).push([tx, tz])
      else if (near.some((n) => n !== '#')) inner.push([tx, tz])
    }))
    return { inner, front, houses, doors }
  }, [layout])

  const z0 = layout.z0 * TILE, z1 = (layout.z0 + layout.rows.length) * TILE
  const end = (layout.rows[0].length + layout.x0) * TILE // the building spans x = 0..end
  return (
    <>
      <group name="walls">
        <WallSet cells={inner} tex={wall} height={WALL_H} />
        <WallSet cells={front} tex={facade} height={FACADE_H} />
        <WallSet cells={houses} tex={house} height={HOUSE_H} />
      </group>
      <Ground x={[0, end]} z={[z0, z1]} tex={floor} />
      <Ground x={[0, end]} z={[z0, z1]} tex={ceil} y={WALL_H} />
      {layout.x0 < 0 && (
        <>
          <Ground x={[layout.x0 * TILE, STREET_X]} z={[z0, z1]} tex={street} size={[2 * TILE, TILE]} />
          <Ground x={[STREET_X, 0]} z={[z0, z1]} tex={sidewalk} />
          <Text position={[-0.05, 5, 1.5 * TILE]} rotation-y={-Math.PI / 2} fontSize={1} color={GOLD}
            outlineWidth={0.04} outlineColor="#3a2a14">ARCHIVUM</Text>
          <Props props={layout.props} />
          <FrontDoor tex={door} />
        </>
      )}
      {doors.map(([tx, tz]) => tx === 0
        ? <Lintel key="front" tx={tx} tz={tz} tex={facade} top={FACADE_H} />
        : <Lintel key={`${tx},${tz}`} tx={tx} tz={tz} tex={wall} top={WALL_H} />)}
      <mesh rotation-x={-Math.PI / 2} position={[1.5 * TILE, 0.01, 0.5 * TILE]}>
        <planeGeometry args={[TILE, TILE]} />
        <meshBasicMaterial map={lite} />
      </mesh>
      <Text position={[TILE + 0.03, 2, 0.5 * TILE]} rotation-y={Math.PI / 2} fontSize={0.3} color={GOLD}>ASCENSOR</Text>
      {layout.rooms.map((r) => (
        <Text key={r.id} position={[r.sign.x, (DOOR_H + WALL_H) / 2, r.sign.z]} rotation-y={r.sign.rot}
          fontSize={0.22} maxWidth={TILE * 1.8} textAlign="center" color={GOLD}>
          {r.title.toUpperCase()}
        </Text>
      ))}
      <group name="exhibits">
        {layout.rooms.flatMap((r) => (byRoom.get(r.id) ?? []).map((ex, i) => (
          <Suspense key={ex.id} fallback={null}>
            <ExhibitView ex={ex} slot={r.slots[i]} quiet={quiet} />
          </Suspense>
        )))}
      </group>
    </>
  )
}

// one instanced box per wall tile; the texture repeats once per tile across and every TILE meters up
function WallSet({ cells, tex, height }: { cells: Cell[]; tex: THREE.Texture; height: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const map = useMemo(() => {
    const t = tex.clone()
    retro(t, true)
    t.repeat.set(1, height / TILE)
    return t
  }, [tex, height])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    cells.forEach(([tx, tz], i) => ref.current.setMatrixAt(i, m.makeTranslation((tx + 0.5) * TILE, height / 2, (tz + 0.5) * TILE)))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [cells, height])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
      <boxGeometry args={[TILE, height, TILE]} />
      <meshBasicMaterial map={map} />
    </instancedMesh>
  )
}

// a textured floor (or a ceiling when y > 0) over x × z; size is how many meters one copy of the texture covers
function Ground({ x: [x0, x1], z: [z0, z1], tex, y = 0, size = [TILE, TILE] }: {
  x: [number, number]; z: [number, number]; tex: THREE.Texture; y?: number; size?: [number, number]
}) {
  const w = x1 - x0, d = z1 - z0
  const map = useMemo(() => {
    const t = tex.clone()
    retro(t, true)
    t.repeat.set(w / size[0], d / size[1])
    return t
  }, [tex, w, d, size[0], size[1]])
  return (
    <mesh rotation-x={y > 0 ? Math.PI / 2 : -Math.PI / 2} position={[(x0 + x1) / 2, y, (z0 + z1) / 2]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={map} />
    </mesh>
  )
}

function Lintel({ tx, tz, tex, top }: { tx: number; tz: number; tex: THREE.Texture; top: number }) {
  const map = useMemo(() => {
    const t = tex.clone()
    retro(t, true)
    t.repeat.set(1, (top - DOOR_H) / TILE)
    return t
  }, [tex, top])
  return (
    <mesh position={[(tx + 0.5) * TILE, (DOOR_H + top) / 2, (tz + 0.5) * TILE]}>
      <boxGeometry args={[TILE, top - DOOR_H, TILE]} />
      <meshBasicMaterial map={map} />
    </mesh>
  )
}

// The front door slides up into the lintel like a Doom door when you come near, and drops behind you.
// shortcut: it only reacts to you, so other visitors seem to walk through it while it's closed on your screen
const frontDoor = { open: 0 } // 0 closed .. 1 open; Player reads it to block the doorway
const DOOR_AT = { x: 0.5 * TILE, z: 1.5 * TILE } // center of the front door tile (0, 1)

function FrontDoor({ tex }: { tex: THREE.Texture }) {
  const ref = useRef<THREE.Mesh>(null!)
  const near = useRef(false)
  const sound = useMemo(() => ({ open: new Audio('/doom/dsdoropn.wav'), close: new Audio('/doom/dsdorcls.wav') }), [])
  useMemo(() => retro(tex), [tex])
  useFrame(({ camera }, dt) => {
    const now = Math.hypot(camera.position.x - DOOR_AT.x, camera.position.z - DOOR_AT.z) < 4
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
    <mesh ref={ref} position={[DOOR_AT.x, DOOR_H / 2, DOOR_AT.z]}>
      <boxGeometry args={[0.25, DOOR_H, TILE]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  )
}

// shortcut: props are walk-through sprites; mark their tiles solid if people start hiding inside trees
function Props({ props }: { props: Prop[] }) {
  const art = { tree: useTexture('/doom/smita0.png'), lamp: useTexture('/doom/tlmpa0.png') }
  useMemo(() => { retro(art.tree); retro(art.lamp) }, [art.tree, art.lamp])
  const scale = { tree: 1.6, lamp: 1 } // trees a bit bigger than Doom size so they read as trees
  return props.map((p, i) => {
    const img = art[p.kind].image as HTMLImageElement, s = PX * scale[p.kind]
    return (
      <sprite key={i} position={[p.x, (img.height * s) / 2, p.z]} scale={[img.width * s, img.height * s, 1]}>
        <spriteMaterial map={art[p.kind]} alphaTest={0.5} />
      </sprite>
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
      {ex.caption && <Text position={[0, 0.8, 0.01]} fontSize={0.14} maxWidth={MAX_W} textAlign="center" color="#ddd">{ex.caption}</Text>}
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
const R = 0.3 // body radius

function Player({ layout, floorId, onElevator, onPick }: {
  layout: Layout; floorId: string; onElevator: (on: boolean) => void; onPick: (ex: Exhibit | null) => void
}) {
  const { camera, scene } = useThree()
  const keys = useRef<Record<string, boolean>>({})
  const last = useRef<{ elevator?: boolean; pick?: Exhibit | null }>({})
  const ray = useMemo(() => new THREE.Raycaster(undefined, undefined, 0, 4), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  // arriving at the museum puts you at layout.start (the street); the elevator drops you next to itself
  const arrived = useRef(false)
  const spawn = () => {
    const s = arrived.current ? SPAWN : layout.start
    arrived.current = true
    camera.position.set(s.x, EYE, s.z)
    camera.rotation.set(0, -Math.PI / 2, 0)
  }
  useEffect(spawn, [floorId])

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
    const turn = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0)
    if (turn) camera.rotateOnWorldAxis(UP, turn * 2.5 * dt)

    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
    const side = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const step = (k.ShiftLeft || k.ShiftRight ? 8 : 4) * dt
    // walls, and the front door (the only doorway at x < TILE) until it's mostly up
    const solid = (x: number, z: number) => {
      const t = tileAt(layout, x, z)
      return t === '#' || (t === 'D' && x < TILE && frontDoor.open < 0.8)
    }
    const free = (x: number, z: number) => [[-R, -R], [R, -R], [-R, R], [R, R]].every(([a, b]) => !solid(x + a, z + b))
    const nx = p.x + (dir.x * fwd - dir.z * side) * step
    const nz = p.z + (dir.z * fwd + dir.x * side) * step
    if (free(nx, p.z)) p.x = nx
    if (free(p.x, nz)) p.z = nz
    if (tileAt(layout, p.x, p.z) === '#') spawn() // the map changed under us

    const elevator = tileAt(layout, p.x, p.z) === 'E'
    if (elevator !== last.current.elevator) onElevator((last.current.elevator = elevator))

    // outside the fog turns into a light haze, inside back to Doom darkness
    const out = tileAt(layout, p.x, p.z) === 'o', fog = scene.fog as THREE.Fog, f = Math.min(1, dt * 3)
    fog.color.lerp(out ? HAZE_COLOR : DARK, f)
    fog.near += ((out ? 25 : 3) - fog.near) * f
    fog.far += ((out ? 70 : 24) - fog.far) * f

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

type Peer = { n: string; f: string; x: number; z: number; y: number; t: number }
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
    ws.current.send(JSON.stringify({ f: floorId, x: camera.position.x, z: camera.position.z, y: Math.atan2(-tmp.x, -tmp.z) }))
  })

  return <>{ids.map((id) => <Avatar key={id} peer={() => peers.current.get(id)} floorId={floorId} tex={tex} />)}</>
}

function Avatar({ peer, floorId, tex }: { peer: () => Peer | undefined; floorId: string; tex: THREE.Texture[] }) {
  const g = useRef<THREE.Group>(null!)
  const sprite = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>(null!)
  useFrame(({ camera, clock }) => {
    const p = peer()
    g.current.visible = !!p && p.f === floorId && performance.now() - p.t < 5000
    if (!p || !g.current.visible) return
    const pos = g.current.position
    if (!g.current.userData.seen) { pos.set(p.x, 0, p.z); g.current.userData.seen = true }
    const moving = Math.hypot(p.x - pos.x, p.z - pos.z) > 0.05
    pos.x += (p.x - pos.x) * 0.2
    pos.z += (p.z - pos.z) * 0.2

    // face the camera, then pick the rotation sprite from where the camera stands relative to their facing
    const vx = camera.position.x - pos.x, vz = camera.position.z - pos.z
    g.current.rotation.y = Math.atan2(vx, vz)
    const rot = ((Math.round((Math.atan2(-vx, -vz) - p.y) / (Math.PI / 4)) % 8) + 8) % 8 + 1
    const frame = moving ? Math.floor(clock.elapsedTime * 6) % 4 : 0
    const t = tex[frame * 5 + (rot <= 5 ? rot - 1 : 9 - rot)]
    const img = t.image as HTMLImageElement
    const w = img.width * PX, h = img.height * PX
    sprite.current.material.map = t
    sprite.current.scale.set(rot > 5 ? -w : w, h, 1)
    sprite.current.position.y = h / 2
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
