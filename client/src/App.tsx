import { useCallback, useEffect, useRef, useState } from 'react'
import { fileUrl, getToken, logout, useMuseum, useUser, type Exhibit, type Museum, type User } from './api'
import { MuseumView, type Chat } from './Museum'
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
let lineKey = 0

function Visit({ museum, user, reload }: { museum: Museum; user: User | null; reload: () => void }) {
  const [floorIdx, setFloorIdx] = useState(0)
  const [locked, setLocked] = useState(false)
  const [elevator, setElevator] = useState(false)
  const [picked, setPicked] = useState<Exhibit | null>(null)
  const [viewing, setViewing] = useState<Exhibit | null>(null)
  const [login, setLogin] = useState(false)
  const [talking, setTalking] = useState(false)
  const [chat, setChat] = useState<(Chat & { key: number })[]>([])
  const say = useRef<(text: string) => void>(() => {})
  const onChat = useCallback((m: Chat) => setChat((c) => [...c.slice(-7), { ...m, key: ++lineKey }]), [])
  const floors = museum.floors
  const current = Math.min(floorIdx, floors.length - 1)
  const floor = floors[current]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Escape') setViewing(null)
      if (e.code === 'KeyE' && picked) { setViewing(picked); document.exitPointerLock() }
      if (e.code === 'KeyT' && user) { e.preventDefault(); setTalking(true) } // T talks, like in DOOM
      if (!elevator) return
      const n = Number(e.key), go = (k: number) => setFloorIdx(Math.max(0, Math.min(floors.length - 1, k)))
      if (n >= 1 && n <= 9) go(n - 1)
      if (e.code === 'PageUp') go(current + 1)
      if (e.code === 'PageDown') go(current - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [picked, elevator, floors.length, current, user])

  if (!floor) return <p className="center">El museo está vacío. <a href="#admin">Crea el primer piso en el panel</a></p>
  return (
    <>
      <MuseumView museum={museum} floor={current} token={user ? getToken() : ''} quiet={!!viewing} onFloor={setFloorIdx}
        onElevator={setElevator} onPick={setPicked} onLock={setLocked} onChanged={reload} onChat={onChat} say={say} />
      <div className="hud">
        <div className="top">
          <span>ARCHIVUM · {floor.name} ({current + 1}/{floors.length})</span>
          {user
            ? <span>{user.name} · <a href="#admin">Panel</a> · <button className="link" onClick={logout}>Salir</button></span>
            : <button onClick={() => setLogin(true)}>Entrar / Registrarse</button>}
        </div>
        <div className={talking ? 'chat open' : 'chat'} aria-live="polite">
          {chat.map((m) => <div key={m.key}><b>{m.n}:</b> {m.chat}</div>)}
          {talking && (
            <form onSubmit={(e) => {
              e.preventDefault()
              const text = String(new FormData(e.currentTarget).get('text')).trim()
              if (text) say.current(text)
              setTalking(false)
            }}>
              <input name="text" autoFocus maxLength={200} autoComplete="off" aria-label="Mensaje" placeholder="Di algo… (Enter)"
                onBlur={() => setTalking(false)} onKeyDown={(e) => e.key === 'Escape' && setTalking(false)} />
            </form>
          )}
        </div>
        {locked && <div className="crosshair">+</div>}
        <div className="bottom">
          {picked && <div>[E] ver · {picked.caption || KIND[picked.kind]}</div>}
          {elevator && <div>ASCENSOR · piso {current + 1} de {floors.length} · [PgUp] subir · [PgDn] bajar · [1-9] ir directo</div>}
        </div>
      </div>
      {!locked && !viewing && !login && (
        <div id="lock" className="overlay">
          <div>
            <h1>ARCHIVUM</h1>
            <p>Click para entrar</p>
            <p>WASD / flechas: moverse · mouse: mirar · Shift: correr · E: ver de cerca · T: chatear · Esc: salir</p>
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
