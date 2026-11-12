import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { noise, LOT, TILE, type Layout, type Lot } from './layout'
import { cloth, concrete, curtain, railing, roofTiles, shopfront, shutters, stucco, withWindow } from './textures'

// The town on the island, built from three templates on the lots the layout leaves for it: houses with tiled roofs,
// blocks of flats with shops downstairs, and glass towers on the few blocks furthest from the castle. Each
// lot's seed picks its template's sizes, colors and roof.
//
// Every material is one mesh for the whole town: each building's boxes and roofs are merged into it, their UVs in
// texture repeats so a texture keeps its scale on any building, and a color per vertex tints them. Small things
// (balconies, awnings, air conditioners, water tanks, chimneys, antennas) are instanced and only drawn on the lots
// near you: that's the town's LOD, and past DETAIL the fog has mostly swallowed them anyway.

const S = 3 // a storey in town
const DETAIL = 70 // how far from you a lot keeps its small things, in meters
const PASTEL = ['#f3e3c8', '#e9c9a6', '#f0d4cc', '#cfe0e8', '#e6e0ae', '#ffffff', '#d9e6cf']
const SHUTTER = ['#3f6e4a', '#2f5d8a', '#8a3b2f', '#6b5a3a']
const AWNING = ['#b33a3a', '#2a7a5a', '#2f5d8a', '#c98a1c', '#6d3aa8']
const seed = (l: Lot, k: number) => noise(l.x0, l.z0, k)
const pick = <T,>(l: Lot, k: number, of: T[]) => of[Math.floor(seed(l, k) * of.length)]

// a lot's middle and side, in meters
const site = (l: Lot) => { const w = LOT[l.kind] * TILE; return { x: l.x0 * TILE + w / 2, z: l.z0 * TILE + w / 2, w } }

// pieces for one merged mesh; u and v: how many meters one repeat of its texture covers across and up
class Batch {
  parts: THREE.BufferGeometry[] = []
  constructor(readonly u = TILE, readonly v = S) {}
  add(g: THREE.BufferGeometry, color = '#fff') {
    const c = new THREE.Color(color), n = g.attributes.position.count
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3))
    this.parts.push(g)
  }
  // a box standing on y; its faces tile the texture by their own size
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color?: string) {
    const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv as THREE.BufferAttribute
    const size = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]] // across and up, face by face
    for (let i = 0; i < uv.count; i++) {
      const [a, b] = size[Math.floor(i / 4)]
      uv.setXY(i, (uv.getX(i) * a) / this.u, (uv.getY(i) * b) / this.v)
    }
    this.add(g.translate(x, y + sy / 2, z), color)
  }
  // a roof on y, sx by sz and h tall: hipped (four slopes to a point) or gabled (two slopes, its ridge along x or z)
  roof(x: number, y: number, z: number, sx: number, sz: number, h: number, kind: 'hip' | 'gable-x' | 'gable-z', color?: string) {
    const g = kind === 'hip'
      ? unit(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4))
      : unit(new THREE.CylinderGeometry(1, 1, 1, 3).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)) // a prism, ridge along x
    if (kind === 'gable-z') g.rotateY(Math.PI / 2)
    const [a, b] = kind === 'gable-z' ? [sz, sx] : [sx, sz]
    g.scale(kind === 'gable-z' ? b : a, h, kind === 'gable-z' ? a : b)
    const uv = g.attributes.uv as THREE.BufferAttribute, slope = Math.hypot(h, b / 2)
    for (let i = 0; i < uv.count; i++) { // rows of tiles run along the eaves
      const u = uv.getX(i), v = uv.getY(i)
      if (kind === 'hip') uv.setXY(i, (u * 2 * (sx + sz)) / this.u, (v * slope) / this.v)
      else uv.setXY(i, (v * a) / this.u, (u * slope * 3) / this.v)
    }
    this.add(g.translate(x, y, z), color)
  }
  // a flat picture (a window, a door) on a wall facing out along (nx, nz), its middle at (x, y, z)
  decal(x: number, y: number, z: number, nx: number, nz: number, w: number, h: number) {
    const g = new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz))
    this.add(g.translate(x + nx * 0.03, y, z + nz * 0.03))
  }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts) : null
    this.parts.forEach((p) => p.dispose())
    return g
  }
}

// a geometry scaled and moved into the unit box standing on the origin: x and z in -0.5..0.5, y in 0..1
function unit(g: THREE.BufferGeometry) {
  g.computeBoundingBox()
  const b = g.boundingBox!, size = b.getSize(new THREE.Vector3()), mid = b.getCenter(new THREE.Vector3())
  return g.translate(-mid.x, -b.min.y, -mid.z).scale(1 / size.x, 1 / size.y, 1 / size.z)
}

// a small thing on a lot, drawn only near you: its kind, middle, size and color
type Detail = { kind: 'slab' | 'rail' | 'awning' | 'box' | 'tank' | 'chimney' | 'mast'; p: [number, number, number]; s: [number, number, number]; c?: string }
const FACES = [[1, 0], [-1, 0], [0, 1], [0, -1]]

// The templates: each adds a lot's building to the batches and returns its small things
type Batches = Record<'stucco' | 'roof' | 'shutters' | 'door' | 'shop' | 'concrete' | 'glass', Batch> & { flats: Batch[] }

function house(l: Lot, b: Batches): Detail[] {
  const { x, z, w: lotW } = site(l), w = lotW - 0.7, hw = w / 2, storeys = seed(l, 1) < 0.45 ? 1 : 2, h = storeys * S
  const roof = (['hip', 'gable-x', 'gable-z'] as const)[Math.floor(seed(l, 2) * 3)], rise = 1.5 + seed(l, 3) * 0.8
  b.concrete.box(x, 0, z, w + 0.12, 0.4, w + 0.12)
  b.stucco.box(x, 0, z, w, h, w, pick(l, 4, PASTEL))
  b.roof.roof(x, h, z, w + 0.6, w + 0.6, rise, roof, seed(l, 5) < 0.3 ? '#d8c8c0' : '#ffffff')
  const door = Math.floor(seed(l, 6) * 4)
  FACES.forEach(([nx, nz], f) => {
    const [fx, fz] = [x + nx * hw, z + nz * hw], [ax, az] = [-nz, nx] // the face's middle, and along it
    for (let k = 0; k < storeys; k++) {
      for (const along of [-0.85, 0.85]) {
        if (!k && f === door && along > 0) b.door.decal(fx + ax * along, 1.05, fz + az * along, nx, nz, 0.95, 2.1)
        else b.shutters.decal(fx + ax * along, k * S + 1.7, fz + az * along, nx, nz, 1.1, 1.2)
      }
    }
  })
  return seed(l, 7) < 0.6 ? [{ kind: 'chimney', p: [x + hw * 0.45, h + rise * 0.55, z - hw * 0.3], s: [0.5, rise + 0.4, 0.5] }] : []
}

function flats(l: Lot, b: Batches): Detail[] {
  const { x, z, w: lotW } = site(l), w = lotW - 0.4, hw = w / 2, storeys = 4 + Math.floor(seed(l, 1) * 4), shop = 3.4
  const top = shop + (storeys - 1) * S, wall = Math.floor(seed(l, 2) * b.flats.length)
  b.shop.box(x, 0, z, w, shop, w)
  b.flats[wall].box(x, shop, z, w, top - shop, w, wall === b.flats.length - 1 ? pick(l, 3, PASTEL) : undefined)
  b.concrete.box(x, shop - 0.15, z, w + 0.3, 0.3, w + 0.3) // a band over the shops
  b.concrete.box(x, top, z, w + 0.4, 0.35, w + 0.4) // the cornice, and the roof under it
  for (const [nx, nz] of FACES) { // the parapet
    const along = nx ? 0.25 : w + 0.4, across = nx ? w + 0.4 : 0.25
    b.concrete.box(x + nx * (hw + 0.075), top + 0.35, z + nz * (hw + 0.075), along, 0.8, across)
  }
  const out: Detail[] = [], awning = pick(l, 4, AWNING), balconies = seed(l, 5) < 0.5 ? [0, 1] : [2, 3]
  FACES.forEach(([nx, nz], f) => {
    const [ax, az] = [-nz, nx], at = (along: number, y: number, outward: number, sx: number, sy: number, sz: number, kind: Detail['kind'], c?: string): Detail =>
      ({ kind, p: [x + nx * (hw + outward) + ax * along, y, z + nz * (hw + outward) + az * along], s: nx ? [sz, sy, sx] : [sx, sy, sz], c })
    out.push(at(0, shop - 0.55, 0.45, w * 0.85, 0.12, 0.9, 'awning', awning))
    for (let k = 1; k < storeys; k++) {
      for (const along of [-2, 2]) {
        const y = shop + (k - 1) * S
        if (balconies.includes(f)) out.push(at(along, y + 0.06, 0.45, 1.8, 0.12, 0.9, 'slab'), at(along, y + 0.55, 0.88, 1.8, 0.9, 0.05, 'rail'))
        else if (seed(l, 10 + k * 4 + f) < 0.35) out.push(at(along + 1.1, y + 1.3, 0.2, 0.7, 0.5, 0.4, 'box', '#d6d6d0'))
      }
    }
  })
  out.push({ kind: 'tank', p: [x - hw * 0.4, top + 1.3, z + hw * 0.35], s: [1.6, 1.8, 1.6] })
  out.push({ kind: 'box', p: [x + hw * 0.35, top + 1.6, z - hw * 0.3], s: [2.4, 2.6, 2.4], c: '#bdb8ae' }) // the stairs' hut
  return out
}

function tower(l: Lot, b: Batches): Detail[] {
  const { x, z } = site(l), w = 8, storeys = 10 + Math.floor(seed(l, 1) * 7), h = storeys * S, tint = seed(l, 2) < 0.5 ? '#ffffff' : '#cfe3ff'
  b.concrete.box(x, 0, z, w + 0.8, 0.5, w + 0.8)
  b.glass.box(x, 0.5, z, w, S * 1.4, w, '#7d8a99') // a dark lobby
  b.glass.box(x, 0.5 + S * 1.4, z, w, h - S * 1.4, w, tint)
  b.concrete.box(x, h + 0.5, z, w + 0.3, 0.4, w + 0.3)
  b.glass.box(x, h + 0.9, z, w - 2.4, S * 2, w - 2.4, tint) // a crown set back from the edge
  b.concrete.box(x, h + 0.9 + S * 2, z, w - 2, 0.4, w - 2)
  return [{ kind: 'mast', p: [x, h + 1.3 + S * 2 + 3, z], s: [0.25, 6, 0.25] }]
}

export function City({ ground }: { ground: Layout }) {
  const [brick, brick1, pbrick, stwall, wood] = useTexture(['/doom/brick.png', '/doom/brick1.png', '/doom/pbrick8.png', '/doom/stwall.png', '/doom/wood.png'])
  const tex = useMemo(() => {
    const prep = (t: THREE.Texture) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.magFilter = t.minFilter = THREE.NearestFilter
      t.colorSpace = THREE.SRGBColorSpace
      t.needsUpdate = true
      return t
    }
    return {
      stucco: stucco(), roof: roofTiles(), shop: shopfront(), concrete: concrete(), glass: curtain(), door: prep(wood.clone()),
      shutters: SHUTTER.map(shutters), flats: [...[brick, brick1, pbrick, stwall].map((t) => prep(withWindow(t))), prep(withWindow(stucco()))],
      iron: railing(), cloth: cloth('#ffffff'), brick: prep(pbrick.clone()),
    }
  }, [brick, brick1, pbrick, stwall, wood])

  // the town's meshes, and each lot's small things, built once per map
  const town = useMemo(() => {
    const lots = ground.lots ?? [], f = ground.footprint
    const mid = { x: ((f.x0 + f.x1 + 1) / 2) * TILE, z: ((f.z0 + f.z1 + 1) / 2) * TILE }
    // shutters come in a few colors, a batch each
    const shutterBatches = SHUTTER.map(() => new Batch())
    const b: Batches = {
      stucco: new Batch(), roof: new Batch(TILE, TILE), shutters: shutterBatches[0], door: new Batch(1, 2),
      shop: new Batch(TILE, 3.4), concrete: new Batch(TILE, TILE), glass: new Batch(TILE, S), flats: tex.flats.map(() => new Batch()),
    }
    // the blocks furthest from the castle, about one in seven, are glass towers
    const away = (l: Lot) => { const s = site(l); return Math.hypot(s.x - mid.x, s.z - mid.z) }
    const blocks = lots.filter((l) => l.kind === 'block').sort((a, c) => away(c) - away(a))
    const towers = new Set(blocks.slice(0, Math.max(1, Math.round(blocks.length * 0.15))))
    const details = lots.map((l) => {
      if (l.kind === 'house') return house(l, { ...b, shutters: shutterBatches[Math.floor(seed(l, 8) * SHUTTER.length)] })
      return towers.has(l) ? tower(l, b) : flats(l, b)
    })
    const mesh = (batch: Batch, map: THREE.Texture, cut = false) => ({ geometry: batch.build(), map, cut })
    return {
      details,
      meshes: [
        mesh(b.stucco, tex.stucco), mesh(b.roof, tex.roof), mesh(b.door, tex.door), mesh(b.shop, tex.shop),
        mesh(b.concrete, tex.concrete), mesh(b.glass, tex.glass), ...b.flats.map((batch, i) => mesh(batch, tex.flats[i])),
        ...shutterBatches.map((batch, i) => mesh(batch, tex.shutters[i], true)),
      ],
    }
  }, [ground, tex])

  // the lots near you, kept as the camera moves; only theirs get their small things
  const [near, setNear] = useState<number[]>([])
  const last = useRef({ x: Infinity, z: Infinity })
  useFrame(({ camera: { position: p } }) => {
    if (Math.hypot(p.x - last.current.x, p.z - last.current.z) < 4) return
    last.current = { x: p.x, z: p.z }
    const lots = ground.lots ?? []
    const next = lots.flatMap((l, i) => { const s = site(l); return Math.hypot(s.x - p.x, s.z - p.z) < DETAIL + s.w / 2 ? [i] : [] })
    setNear((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
  })
  const shown = useMemo(() => Map.groupBy(near.flatMap((i) => town.details[i]), (d) => d.kind), [near, town])

  return (
    <>
      {town.meshes.map(({ geometry, map, cut }, i) => geometry && (
        <mesh key={i} geometry={geometry}>
          <meshBasicMaterial map={map} vertexColors alphaTest={cut ? 0.5 : 0} side={cut ? THREE.DoubleSide : THREE.FrontSide} />
        </mesh>
      ))}
      <Parts items={shown.get('slab')} geometry="box" map={tex.concrete} />
      <Parts items={shown.get('rail')} geometry="box" map={tex.iron} cut />
      <Parts items={shown.get('awning')} geometry="box" map={tex.cloth} />
      <Parts items={shown.get('box')} geometry="box" map={tex.cloth} />
      <Parts items={shown.get('chimney')} geometry="box" map={tex.brick} />
      <Parts items={shown.get('tank')} geometry="tank" map={tex.concrete} />
      <Parts items={shown.get('mast')} geometry="mast" map={tex.cloth} />
    </>
  )
}

const SHAPES: Record<string, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(),
  tank: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  mast: () => new THREE.CylinderGeometry(0.3, 0.5, 1, 6),
}

// instanced small things: one geometry scaled and tinted per item
function Parts({ items = [], geometry, map, cut = false }: { items?: Detail[]; geometry: 'box' | 'tank' | 'mast'; map: THREE.Texture; cut?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const shape = useMemo(() => SHAPES[geometry](), [geometry])
  useLayoutEffect(() => {
    if (!items.length) return
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), at = new THREE.Vector3(), size = new THREE.Vector3(), c = new THREE.Color()
    items.forEach((d, i) => {
      ref.current.setMatrixAt(i, m.compose(at.set(...d.p), q, size.set(...d.s)))
      ref.current.setColorAt(i, c.set(d.c ?? '#ffffff'))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh key={items.length} ref={ref} args={[shape, undefined, items.length]}>
      <meshBasicMaterial map={map} alphaTest={cut ? 0.5 : 0} />
    </instancedMesh>
  )
}
