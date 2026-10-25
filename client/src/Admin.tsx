import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorText, fileUrl, type Exhibit, type Floor, type Museum, type Room, type User } from './api'
import { AuthForm } from './Auth'

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4'
const ICON = { photo: '▣', video: '▶', audio: '♪', note: '✎' }

function Page({ children }: { children: ReactNode }) {
  return <main className="page"><h1>ARCHIVUM · Panel</h1><p><a href="#">← Volver al museo</a></p>{children}</main>
}

function Pick<T extends { id: string }>({ items, label, selected, onSelect, onDelete }: {
  items: T[]; label: (i: T) => string; selected: string; onSelect: (id: string) => void; onDelete?: (i: T) => void
}) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i.id}>
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
    <section>
      <h2>Usuarios</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            <label className="check">
              <input type="checkbox" checked={u.curator || u.admin} disabled={u.admin} onChange={() => toggle(u)} />
              {u.name} <small>{u.email}{u.admin ? ' · admin' : ''}</small>
            </label>
          </li>
        ))}
      </ul>
      <small>Marcado = curador (puede subir contenido)</small>
    </section>
  )
}

export function Admin({ museum, user, reload }: { museum: Museum; user: User | null; reload: () => void }) {
  const [floorId, setFloorId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  if (!user) return <Page><AuthForm /></Page>
  if (!user.curator && !user.admin) {
    return <Page><p>Hola {user.name}. Tu cuenta todavía no es de curador: pídele al admin que te active en este panel.</p></Page>
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
    const f = await api<Floor>('/floors', { method: 'POST', json: { name: d.get('name') } })
    setFloorId(f.id)
    setRoomId('')
  })
  const addRoom = submit(async (d) => {
    const r = await api<Room>('/rooms', { method: 'POST', json: { floor: floorId, title: d.get('title') } })
    setRoomId(r.id)
  })
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
    <Page>
      <p>{user.admin ? 'Admin' : 'Curador'}: {user.name}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p role="status">{busy}</p>}
      <div className="cols">
        <section>
          <h2>Pisos</h2>
          <Pick items={museum.floors} label={(f) => f.name} selected={floorId} onSelect={(id) => { setFloorId(id); setRoomId('') }}
            onDelete={user.admin ? (f) => confirmDelete(`el piso "${f.name}"`, `/floors/${f.id}`) : undefined} />
          <form className="row" onSubmit={addFloor}>
            <input name="name" placeholder="Nuevo piso" aria-label="Nombre del piso" required maxLength={60} />
            <button disabled={!!busy}>+</button>
          </form>
        </section>
        {floor && (
          <section>
            <h2>Salas · {floor.name}</h2>
            <Pick items={rooms} label={(r) => r.title} selected={roomId} onSelect={setRoomId}
              onDelete={user.admin ? (r) => confirmDelete(`la sala "${r.title}"`, `/rooms/${r.id}`) : undefined} />
            <form className="row" onSubmit={addRoom}>
              <input name="title" placeholder="Nueva sala" aria-label="Nombre de la sala" required maxLength={60} />
              <button disabled={!!busy}>+</button>
            </form>
          </section>
        )}
        {room && (
          <section>
            <h2>{room.title}</h2>
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
