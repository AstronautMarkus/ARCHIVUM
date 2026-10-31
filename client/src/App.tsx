import { useCallback, useEffect, useRef, useState } from 'react'
import { fileUrl, getToken, KIND, logout, useMuseum, useUser, type Exhibit, type Museum, type User } from './api'
import { MuseumView, openRoomDoor, VIEWS, type Act, type Chat, type View } from './Museum'
import { Keypad } from './Keypad'
import { Admin } from './Admin'
import { AuthForm } from './Auth'
import { Home } from './Home'

if (location.hash === '#admin') location.replace('/admin') // the panel's old address

// each page is its own address and a plain link between them reloads the page: the game starts fresh every time
export default function App() {
  const user = useUser()
  const { data, error, reload } = useMuseum()
  const path = location.pathname.replace(/\/+$/, '')
  if (!data) return <p className="center">{error ? `No se pudo conectar: ${error}` : 'Cargando…'}</p>
  if (path === '/play') return <Visit museum={data} user={user} reload={reload} />
  if (path === '/admin') return <Admin museum={data} user={user} reload={reload} />
  return <Home museum={data} user={user} />
}

let lineKey = 0

// a setting remembered in this browser; if storage is blocked (private mode) it just isn't remembered
function useSaved(key: string, initial: string) {
  const [value, setValue] = useState(() => { try { return localStorage.getItem(key) ?? initial } catch { return initial } })
  const save = (v: string) => { setValue(v); try { localStorage.setItem(key, v) } catch { /* not remembered */ } }
  return [value, save] as const
}

function Visit({ museum, user, reload }: { museum: Museum; user: User | null; reload: () => void }) {
  const [floorIdx, setFloorIdx] = useState(0)
  const [locked, setLocked] = useState(false)
  const [elevator, setElevator] = useState(false)
  const [picked, setPicked] = useState<Exhibit | null>(null)
  const [viewing, setViewing] = useState<Exhibit | null>(null)
  const [act, setAct] = useState<Act | null>(null)
  const [typing, setTyping] = useState<Act | null>(null) // the keypad of a PIN room
  const [login, setLogin] = useState(false)
  const [talking, setTalking] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [chat, setChat] = useState<(Chat & { key: number })[]>([])
  const [saved, setView] = useSaved('view', 'media'), [fps, setFps] = useSaved('fps', 'no')
  const view: View = saved in VIEWS ? (saved as View) : 'media'
  const [bigMap, setBigMap] = useState(false)
  const fpsEl = useRef<HTMLDivElement>(null), mapEl = useRef<HTMLCanvasElement>(null)
  const say = useRef<(text: string) => void>(() => {})
  const onChat = useCallback((m: Chat) => setChat((c) => [...c.slice(-7), { ...m, key: ++lineKey }]), [])
  const floors = museum.floors
  const current = Math.min(floorIdx, floors.length - 1)
  const floor = floors[current]
  // closing the viewer or the keypad takes you straight back in: the page let go of the mouse itself, so the browser
  // lets it take it back without a click, and the pause screen only shows if it won't
  const resume = () => {
    setViewing(null)
    setTyping(null)
    setResuming(true)
    Promise.resolve(document.querySelector('canvas')?.requestPointerLock()).catch(() => {}).finally(() => setResuming(false))
  }
  const paused = !locked && !viewing && !login && !typing && !resuming

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'KeyE' && picked) { setViewing(picked); document.exitPointerLock() }
      if (e.code === 'KeyE' && act?.kind === 'pin') { setTyping(act); document.exitPointerLock() }
      if (e.code === 'KeyE' && act?.kind === 'exit') openRoomDoor(act.room)
      if (e.code === 'KeyT' && user) { e.preventDefault(); setTalking(true) } // T talks, like in DOOM
      // and Tab opens the map; with the mouse free it still moves the focus
      if (e.code === 'Tab' && document.pointerLockElement) { e.preventDefault(); setBigMap((b) => !b) }
      if (!elevator) return
      const n = Number(e.key), go = (k: number) => setFloorIdx(Math.max(0, Math.min(floors.length - 1, k)))
      if (n >= 1 && n <= 9) go(n - 1)
      if (e.code === 'PageUp') go(current + 1)
      if (e.code === 'PageDown') go(current - 1)
    }
    // Esc closes the viewer or the keypad when it's let go of: the browser takes the release of an Esc as you leaving
    // the mouse it would just have been given back on the press
    const onUp = (e: KeyboardEvent) => { if (e.code === 'Escape' && (viewing || typing)) resume() }
    addEventListener('keydown', onKey)
    addEventListener('keyup', onUp)
    return () => { removeEventListener('keydown', onKey); removeEventListener('keyup', onUp) }
  }, [picked, act, viewing, typing, elevator, floors.length, current, user])

  if (!floor) return <p className="center">El museo está vacío. <a href="/admin">Crea el primer piso en el panel</a></p>
  return (
    <>
      <MuseumView museum={museum} floor={current} token={user ? getToken() : ''} quiet={!!viewing} view={view} fps={fpsEl} map={mapEl} bigMap={bigMap} onFloor={setFloorIdx}
        onElevator={setElevator} onPick={setPicked} onAct={setAct} onLock={setLocked} onChanged={reload} onChat={onChat} say={say} />
      <div className="hud">
        <div className="top">
          <span>ARCHIVUM · {floor.name} ({current + 1}/{floors.length})</span>
          {user
            ? <span>{user.name} · <a href="/">Inicio</a> · <a href="/admin">Panel</a> · <button className="link" onClick={logout}>Salir</button></span>
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
        <canvas className={bigMap ? 'automap big' : 'automap'} ref={mapEl} aria-label="Mapa" />
        {fps === 'sí' && <div className="fps" ref={fpsEl} />}
        {locked && <div className="crosshair">+</div>}
        <div className="bottom">
          {picked && <div>[E] ver · {picked.caption || KIND[picked.kind]}</div>}
          {act && <div>{act.kind === 'pin' ? `[E] teclear el PIN · ${act.title}` : '[E] SALIDA · abrir la puerta'}</div>}
          {elevator && <div>ASCENSOR · piso {current + 1} de {floors.length} · [PgUp] subir · [PgDn] bajar · [1-9] ir directo</div>}
          {/* in the HUD, not inside #lock: a click there would grab the mouse */}
          {paused && (
            <div className="settings">
              Distancia:
              {Object.keys(VIEWS).map((v) => <button key={v} className={v === view ? 'sel' : ''} onClick={() => setView(v)}>{v}</button>)}
              · <button className={fps === 'sí' ? 'sel' : ''} onClick={() => setFps(fps === 'sí' ? 'no' : 'sí')}>FPS</button>
            </div>
          )}
        </div>
      </div>
      {paused && (
        <div id="lock" className="overlay">
          <div>
            <h1>ARCHIVUM</h1>
            <p>Click para entrar</p>
            <p>WASD / flechas: moverse · mouse: mirar · Shift: correr · Espacio: saltar · E: ver de cerca · T: chatear · Tab: mapa · Esc: salir</p>
          </div>
        </div>
      )}
      {viewing && <Viewer ex={viewing} onClose={resume} />}
      {typing && (
        <div className="overlay modal" onClick={resume}>
          <div onClick={(e) => e.stopPropagation()}>
            <Keypad room={typing.room} title={typing.title} onOpen={() => { openRoomDoor(typing.room); reload() }} onClose={resume} />
          </div>
        </div>
      )}
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
