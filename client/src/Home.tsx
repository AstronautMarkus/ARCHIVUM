import { useState, type ReactNode } from 'react'
import { fileUrl, floorColor, KIND, logout, type Museum, type User } from './api'
import { AuthForm } from './Auth'
import core from './core.json'

const SHOTS = [
  { src: '/shots/calle.jpg', caption: 'La calle y la torre de entrada' },
  { src: '/shots/nucleo.jpg', caption: 'La galería del núcleo' },
  { src: '/shots/patio.jpg', caption: 'El patio y su fuente' },
]
const KEYS = [['WASD', 'moverse'], ['Mouse', 'mirar'], ['Shift', 'correr'], ['Espacio', 'saltar'], ['E', 'ver de cerca'],
  ['T', 'chatear'], ['Tab', 'mapa'], ['Esc', 'pausa']]
const BADGES = [['FREEDOOM', 'https://freedoom.github.io'], ['REACT', 'https://react.dev'], ['THREE.JS', 'https://threejs.org'],
  ['FLASK', 'https://flask.palletsprojects.com'], ['MONGODB', 'https://www.mongodb.com']]

function Box({ title, more, id, children }: { title: string; more?: [string, string]; id?: string; children: ReactNode }) {
  return (
    <section className="p-box" id={id}>
      <h2>{title}{more && <a href={more[1]}>{more[0]} »</a>}</h2>
      <div className="p-in">{children}</div>
    </section>
  )
}

// the front page, like a 2000s game portal: everything the museum has, and the way in
export function Home({ museum, user }: { museum: Museum; user: User | null }) {
  const [login, setLogin] = useState(false)
  const staff = !!user && (user.curator || user.admin)
  const roomOf = new Map(museum.rooms.map((r) => [r.id, r]))
  const floorOf = new Map(museum.floors.map((f, k) => [f.id, { f, k }]))
  // a locked room tells how many it holds; an open one, by what came with it
  const count = (id: string) => roomOf.get(id)?.count ?? museum.exhibits.filter((e) => e.room === id).length
  const total = museum.rooms.reduce((n, r) => n + count(r.id), 0)
  const fullest = [...museum.rooms].sort((a, b) => count(b.id) - count(a.id)).slice(0, 8)
  const latest = museum.exhibits.slice(-8).reverse() // they come oldest first
  const photos = museum.exhibits.filter((e) => e.kind === 'photo').slice(-8).reverse()

  return (
    <div className="portal" id="top">
      <header className="p-head">
        <a href="/" className="p-logo">
          <img src="/doom/playa1.png" alt="" />
          <span><b>ARCHIVUM</b><small>EL MUSEO DE LOS MEJORES MOMENTOS DEL GRUPO</small></span>
        </a>
        <div className="p-login">
          {user ? (
            <>
              <span>Hola, <b>{user.name}</b></span>
              <span>{staff && <><a href="/admin">Panel de curador</a> · </>}<button className="p-link" onClick={logout}>Salir</button></span>
            </>
          ) : (
            <>
              <span>» ¿No eres miembro? <button className="p-link" onClick={() => setLogin(true)}>¡REGÍSTRATE!</button></span>
              <button className="p-btn" onClick={() => setLogin(true)}>Entrar »</button>
            </>
          )}
        </div>
      </header>

      <nav className="p-nav">
        <a href="/" className="on">Inicio</a>
        <a href="/play">Jugar</a>
        <a href="#obras">Obras</a>
        <a href="#salas">Salas</a>
        <a href="#capturas">Capturas</a>
        <a href="#controles">Cómo jugar</a>
        {staff && <a href="/admin">Panel</a>}
      </nav>

      <div className="p-cols">
        <aside>
          <Box title="El museo hoy">
            <ul className="p-stats">
              <li><b>{museum.floors.length}</b> {museum.floors.length === 1 ? 'piso' : 'pisos'}</li>
              <li><b>{museum.rooms.length}</b> {museum.rooms.length === 1 ? 'sala' : 'salas'}</li>
              <li><b>{total}</b> {total === 1 ? 'obra' : 'obras'}</li>
              <li><b>{core.length}</b> clásicos en el núcleo</li>
            </ul>
          </Box>
          <Box title="Pisos">
            {museum.floors.length ? (
              <ul className="p-list">
                {museum.floors.map((f, k) => (
                  <li key={f.id}>
                    <i style={{ background: floorColor(f, k) }} />
                    <span>{k + 1}. {f.name}</span>
                    <small>{museum.rooms.filter((r) => r.floor === f.id).length} salas</small>
                  </li>
                ))}
              </ul>
            ) : <p>Todavía no hay pisos.</p>}
          </Box>
          <Box title="Cómo jugar" id="controles">
            <ul className="p-keys">{KEYS.map(([k, what]) => <li key={k}><kbd>{k}</kbd> {what}</li>)}</ul>
            <p>Para chatear y subir obras necesitas una cuenta. Las salas con candado piden un PIN de 4 dígitos.</p>
          </Box>
        </aside>

        <main>
          <section className="p-hero">
            <h2>★ Tienes que vivir esto</h2>
            <div className="p-hero-in" style={{ backgroundImage: `url(${SHOTS[0].src})` }}>
              <div>
                <h1>ARCHIVUM</h1>
                <p>Un museo en 3D estilo DOOM con los mejores momentos del grupo. Recorre sus pisos, entra a las salas y
                  mira las fotos, videos y notas de todos, en vivo, con tus amigos al lado.</p>
                <a href="/play" className="p-play">▶ JUGAR AHORA</a>
                <small>Gratis · Sin descargas · Directo en tu navegador</small>
              </div>
            </div>
          </section>

          <Box title="Últimas obras" id="obras">
            {photos.length ? (
              <div className="p-grid">
                {photos.map((e) => (
                  <a key={e.id} href={fileUrl(e)} target="_blank" rel="noreferrer">
                    <img src={fileUrl(e, true)} alt="" loading="lazy" />
                    <b>{e.caption || 'Sin título'}</b>
                    <small>{roomOf.get(e.room)?.title}</small>
                  </a>
                ))}
              </div>
            ) : <p>Todavía no hay fotos. {staff ? <a href="/admin">¡Sube la primera!</a> : 'Pronto llegarán.'}</p>}
          </Box>

          <div className="p-two" id="salas">
            <Box title="Salas más llenas">
              <table className="p-table">
                <tbody>
                  {fullest.map((r) => (
                    <tr key={r.id}>
                      <td>{r.locked && '🔒 '}{r.title}</td>
                      <td>Piso {(floorOf.get(r.floor)?.k ?? 0) + 1}</td>
                      <td>{count(r.id)}</td>
                    </tr>
                  ))}
                  {!fullest.length && <tr><td>No hay salas todavía.</td></tr>}
                </tbody>
              </table>
              <a href="/play" className="p-foot">Ir a verlas »</a>
            </Box>
            <Box title="Recién llegado">
              <table className="p-table">
                <tbody>
                  {latest.map((e) => (
                    <tr key={e.id}>
                      <td>{e.caption || e.text.slice(0, 30) || 'Sin título'}</td>
                      <td>{KIND[e.kind]}</td>
                      <td>{roomOf.get(e.room)?.title}</td>
                    </tr>
                  ))}
                  {!latest.length && <tr><td>Nada nuevo todavía.</td></tr>}
                </tbody>
              </table>
              <a href="/play" className="p-foot">Ir a verlo »</a>
            </Box>
          </div>

          <Box title="Capturas" id="capturas">
            <div className="p-shots">
              {SHOTS.map((s) => <figure key={s.src}><img src={s.src} alt={s.caption} loading="lazy" /><figcaption>{s.caption}</figcaption></figure>)}
            </div>
          </Box>
        </main>

        <aside className="p-posters">
          <Box title="En el núcleo">
            {core.slice(0, 6).map((c) => (
              <figure key={c.file}><img src={c.file} alt="" loading="lazy" /><figcaption>{c.caption.split(' · ')[0]}</figcaption></figure>
            ))}
          </Box>
        </aside>
      </div>

      <footer className="p-footer">
        <nav><a href="/">Inicio</a> | <a href="/play">Jugar</a> | <a href="#controles">Cómo jugar</a> | <a href="/admin">Panel</a></nav>
        <div className="p-badges">{BADGES.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noreferrer">{name}</a>)}</div>
        <p>Texturas y sprites de Freedoom (licencia BSD) · Pinturas del núcleo de dominio público</p>
        <p>© {new Date().getFullYear()} ARCHIVUM · Hecho por el grupo, para el grupo · Mejor visto a 1024×768</p>
      </footer>

      {login && <div className="overlay modal"><AuthForm onDone={() => setLogin(false)} /></div>}
    </div>
  )
}
