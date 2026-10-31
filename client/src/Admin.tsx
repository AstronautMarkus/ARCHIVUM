import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorText, fileUrl, floorColor, FLOOR_COLORS, logout, type Exhibit, type Floor, type Museum, type Room, type User } from './api'
import { AuthForm } from './Auth'

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4'
const ICON = { photo: '▣', video: '▶', audio: '♪', note: '✎' }

// the panel is a plain tool, nothing like the game or the front page
function Page({ user, children }: { user: User | null; children: ReactNode }) {
  return (
    <div className="dash">
      <header>
        <b>ARCHIVUM</b><span>Panel</span>
        <nav>
          <a href="/">Ver sitio</a>
          <a href="/play">Jugar</a>
          {user && <button className="link" onClick={logout}>Salir</button>}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  )
}

function Pick<T extends { id: string }>({ items, label, selected, onSelect, onDelete, swatch }: {
  items: T[]; label: (i: T) => string; selected: string; onSelect: (id: string) => void; onDelete?: (i: T) => void
  swatch?: (i: T, k: number) => string // a color square before each item
}) {
  return (
    <ul>
      {items.map((i, k) => (
        <li key={i.id}>
          {swatch && <span className="swatch" style={{ background: swatch(i, k) }} />}
          <button className={i.id === selected ? 'sel' : ''} onClick={() => onSelect(i.id)}>{label(i)}</button>
          {onDelete && <button className="link" onClick={() => onDelete(i)}>borrar</button>}
        </li>
      ))}
    </ul>
  )
}

function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const load = () => api<User[]>('/users').then(setUsers).catch((e) => setError(errorText(e)))
  useEffect(() => { load() }, [])
  const toggle = (u: User) =>
    api(`/users/${u.id}`, { method: 'PATCH', json: { curator: !u.curator } }).then(load).catch((e) => setError(errorText(e)))
  return (
    <section className="wide">
      <h2>Usuarios</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Curador</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.admin ? 'Admin' : u.curator ? 'Curador' : 'Visitante'}</td>
              <td><input type="checkbox" aria-label={`${u.name} es curador`} checked={u.curator || u.admin} disabled={u.admin} onChange={() => toggle(u)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>Los curadores pueden crear pisos y salas y subir contenido.</small>
    </section>
  )
}

export function Admin({ museum, user, reload }: { museum: Museum; user: User | null; reload: () => void }) {
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  if (!user) return <Page user={user}><AuthForm /></Page>
  if (!user.curator && !user.admin) {
    return <Page user={user}><p>Hola {user.name}. Tu cuenta todavía no es de curador: pídele al admin que te active en este panel.</p></Page>
  }

  const run = (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setError('')
    fn().catch((e) => setError(errorText(e))).finally(() => { setBusy(''); reload() })
  }
  const submit = (fn: (data: FormData) => Promise<unknown>) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    run('Guardando…', () => fn(new FormData(form)).then(() => form.reset()))
  }
  const confirmDelete = (what: string, path: string) => {
    if (confirm(`¿Borrar ${what}? Se borra todo lo que tenga adentro.`)) run('Borrando…', () => api(path, { method: 'DELETE' }))
  }

  const floor = museum.floors.find((f) => f.id === floorId)
  const rooms = museum.rooms.filter((r) => r.floor === floorId)
  const room = rooms.find((r) => r.id === roomId)
  const exhibits = museum.exhibits.filter((e) => e.room === roomId)

  const addFloor = submit(async (d) => {
    const f = await api<Floor>('/floors', { method: 'POST', json: { name: d.get('name'), color: d.get('color') } })
    setFloorId(f.id)
    setRoomId('')
  })
  const addRoom = submit(async (d) => {
    const r = await api<Room>('/rooms', { method: 'POST', json: { floor: floorId, title: d.get('title'), pin: d.get('pin') } })
    setRoomId(r.id)
  })
  const setPin = submit((d) => api(`/rooms/${roomId}/pin`, { method: 'PUT', json: { pin: d.get('pin') } }))
  const upload = submit(async (d) => {
    const files = d.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    const caption = String(d.get('caption')), text = String(d.get('text')).trim()
    const send = (fields: Record<string, string | File>) => {
      const body = new FormData()
      Object.entries({ room: roomId, caption, ...fields }).forEach(([k, v]) => body.set(k, v))
      return api('/exhibits', { method: 'POST', body })
    }
    for (const [i, file] of files.entries()) {
      setBusy(`Subiendo ${i + 1} de ${files.length}…`)
      await send({ file })
    }
    if (text) await send({ text })
  })
  const removeExhibit = (ex: Exhibit) => {
    if (confirm(`¿Borrar "${ex.caption || ex.file || 'nota'}"?`)) run('Borrando…', () => api(`/exhibits/${ex.id}`, { method: 'DELETE' }))
  }

  return (
    <Page user={user}>
      <div className="stats">
        <div><b>{museum.floors.length}</b>Pisos</div>
        <div><b>{museum.rooms.length}</b>Salas</div>
        <div><b>{museum.exhibits.length}</b>Obras</div>
        <div><b>{user.name}</b>{user.admin ? 'Admin' : 'Curador'}</div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p className="busy" role="status">{busy}</p>}
      <div className="cols">
        <section>
          <h2>Pisos</h2>
          <Pick items={museum.floors} label={(f) => f.name} selected={floorId} onSelect={(id) => { setFloorId(id); setRoomId('') }}
            swatch={floorColor}
            onDelete={user.admin ? (f) => confirmDelete(`el piso "${f.name}"`, `/floors/${f.id}`) : undefined} />
          <form className="row" onSubmit={addFloor}>
            <input name="name" placeholder="Nuevo piso" aria-label="Nombre del piso" required maxLength={60} />
            {/* its floor will be this color and white; it suggests the next one in line */}
            <input type="color" name="color" aria-label="Color del piso" key={museum.floors.length}
              defaultValue={FLOOR_COLORS[museum.floors.length % FLOOR_COLORS.length]} />
            <button disabled={!!busy}>+</button>
          </form>
        </section>
        {floor && (
          <section>
            <h2>Salas · {floor.name}</h2>
            <Pick items={rooms} label={(r) => r.title + (r.locked ? ' 🔒' : '')} selected={roomId} onSelect={setRoomId}
              onDelete={user.admin ? (r) => confirmDelete(`la sala "${r.title}"`, `/rooms/${r.id}`) : undefined} />
            <form className="row" onSubmit={addRoom}>
              <input name="title" placeholder="Nueva sala" aria-label="Nombre de la sala" required maxLength={60} />
              <input name="pin" placeholder="PIN" aria-label="PIN de la sala (opcional)" inputMode="numeric" pattern="\d{4}" maxLength={4} size={5} />
              <button disabled={!!busy}>+</button>
            </form>
          </section>
        )}
        {room && (
          <section>
            <h2>{room.title}</h2>
            <form className="row" onSubmit={setPin}>
              <input name="pin" placeholder={room.locked ? 'Nuevo PIN' : 'PIN (4 dígitos)'} aria-label="PIN de la sala" inputMode="numeric" pattern="\d{4}" maxLength={4} size={9} />
              <button disabled={!!busy}>{room.locked ? 'Cambiar PIN' : 'Poner PIN'}</button>
              {room.locked && <button type="button" className="link" disabled={!!busy} onClick={() => run('Guardando…', () => api(`/rooms/${roomId}/pin`, { method: 'PUT', json: { pin: '' } }))}>quitar</button>}
            </form>
            <ul>
              {exhibits.map((ex) => (
                <li key={ex.id}>
                  {ex.kind === 'photo' ? <img src={fileUrl(ex, true)} alt="" /> : <span>{ICON[ex.kind]}</span>}
                  <span style={{ flex: 1 }}>{ex.caption || ex.text.slice(0, 40) || 'Sin descripción'}</span>
                  {(ex.author === user.id || user.admin) && <button className="link" onClick={() => removeExhibit(ex)}>borrar</button>}
                </li>
              ))}
            </ul>
            <form onSubmit={upload} style={{ display: 'grid', gap: 8 }}>
              <label>Fotos, videos o música<input type="file" name="files" multiple accept={ACCEPT} /></label>
              <label>Nota (opcional)<textarea name="text" rows={3} maxLength={2000} /></label>
              <label>Descripción<input name="caption" maxLength={200} /></label>
              <button disabled={!!busy}>Subir</button>
            </form>
          </section>
        )}
        {user.admin && <Users />}
      </div>
    </Page>
  )
}
