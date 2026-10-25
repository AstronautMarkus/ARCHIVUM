import { useEffect, useState } from 'react'
import { fileUrl, getToken, logout, useMuseum, useUser, type Exhibit, type Museum, type User } from './api'
import { MuseumView } from './Museum'
import { Admin } from './Admin'
import { AuthForm } from './Auth'

export default function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const onHash = () => setHash(location.hash)
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const user = useUser()
  const { data, error, reload } = useMuseum()
  if (!data) return <p className="center">{error ? `No se pudo conectar: ${error}` : 'Cargando…'}</p>
  return hash === '#admin'
    ? <Admin museum={data} user={user} reload={reload} />
    : <Visit museum={data} user={user} reload={reload} />
}

const KIND = { photo: 'Foto', video: 'Video', audio: 'Música', note: 'Nota' }

function Visit({ museum, user, reload }: { museum: Museum; user: User | null; reload: () => void }) {
  const [floorIdx, setFloorIdx] = useState(0)
  const [locked, setLocked] = useState(false)
  const [elevator, setElevator] = useState(false)
  const [picked, setPicked] = useState<Exhibit | null>(null)
  const [viewing, setViewing] = useState<Exhibit | null>(null)
  const [login, setLogin] = useState(false)
  const floors = museum.floors
  const floor = floors[Math.min(floorIdx, floors.length - 1)]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Escape') setViewing(null)
      if (e.code === 'KeyE' && picked) { setViewing(picked); document.exitPointerLock() }
      const n = Number(e.key)
      if (elevator && n >= 1 && n <= floors.length) setFloorIdx(n - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [picked, elevator, floors.length])

  if (!floor) return <p className="center">El museo está vacío. <a href="#admin">Crea el primer piso en el panel</a></p>
  return (
    <>
      <MuseumView museum={museum} floor={floor} token={user ? getToken() : ''} quiet={!!viewing}
        onElevator={setElevator} onPick={setPicked} onLock={setLocked} onChanged={reload} />
      <div className="hud">
        <div className="top">
          <span>ARCHIVUM · {floor.name}</span>
          {user
            ? <span>{user.name} · <a href="#admin">Panel</a> · <button className="link" onClick={logout}>Salir</button></span>
            : <button onClick={() => setLogin(true)}>Entrar / Registrarse</button>}
        </div>
        {locked && <div className="crosshair">+</div>}
        <div className="bottom">
          {picked && <div>[E] ver · {picked.caption || KIND[picked.kind]}</div>}
          {elevator && <div>ASCENSOR · {floors.map((f, i) => `[${i + 1}] ${f.name}`).join('  ')}</div>}
        </div>
      </div>
      {!locked && !viewing && !login && (
        <div id="lock" className="overlay">
          <div>
            <h1>ARCHIVUM</h1>
            <p>Click para entrar</p>
            <p>WASD / flechas: moverse · mouse: mirar · Shift: correr · E: ver de cerca · Esc: salir</p>
          </div>
        </div>
      )}
      {viewing && <Viewer ex={viewing} onClose={() => setViewing(null)} />}
      {login && <div className="overlay modal"><AuthForm onDone={() => setLogin(false)} /></div>}
    </>
  )
}

function Viewer({ ex, onClose }: { ex: Exhibit; onClose: () => void }) {
  const url = fileUrl(ex)
  return (
    <div className="overlay modal" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        {ex.kind === 'photo' && <img src={url} alt={ex.caption || 'Foto'} />}
        {ex.kind === 'video' && <video src={url} controls autoPlay />}
        {ex.kind === 'audio' && <audio src={url} controls autoPlay />}
        {ex.kind === 'note' && <p className="note">{ex.text}</p>}
        {ex.caption && <p>{ex.caption}</p>}
        <button onClick={onClose}>Cerrar (Esc)</button>
      </div>
    </div>
  )
}
