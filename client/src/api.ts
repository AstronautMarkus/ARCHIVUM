import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

export type User = { id: string; email: string; name: string; curator: boolean; admin: boolean }
export type Floor = { id: string; name: string; color?: string } // its floor is `color` and white
// what each new floor's floor looks like unless the curator picks a color: black, red, blue, green...
export const FLOOR_COLORS = ['#1c1c1e', '#b32626', '#2350a8', '#2e7d3e', '#c99a1e', '#6d3aa8', '#1f8a8a', '#d0651c']
export const floorColor = (f: Floor, k: number) => f.color ?? FLOOR_COLORS[k % FLOOR_COLORS.length]
export type Room = { id: string; floor: string; title: string }
export type Exhibit = {
  id: string; room: string; author: string; kind: 'photo' | 'video' | 'audio' | 'note'
  file: string; thumb: string; caption: string; text: string
}
export type Museum = { floors: Floor[]; rooms: Room[]; exhibits: Exhibit[] }

// the session survives reloads in localStorage
let session: { token: string; user: User | null } = JSON.parse(localStorage.getItem('archivum') ?? '{"token":"","user":null}')
const listeners = new Set<() => void>()

export function setSession(token: string, user: User | null) {
  session = { token, user }
  localStorage.setItem('archivum', JSON.stringify(session))
  listeners.forEach((f) => f())
}
export const logout = () => setSession('', null)
export const getToken = () => session.token

export async function api<T = unknown>(path: string, { json, ...init }: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = session.token ? { Authorization: `Bearer ${session.token}` } : {}
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`/api${path}`, { ...init, headers, body: json !== undefined ? JSON.stringify(json) : init.body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { status: res.status })
  return data as T
}

// the core's art (core.json) ships with the client under an absolute path; everything else was uploaded
export const fileUrl = (e: Exhibit, thumb?: boolean) => (e.file.startsWith('/') ? e.file : `/files/${thumb && e.thumb ? e.thumb : e.file}`)
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// the whole museum; reload() runs again when the server pushes a change
export function useMuseum() {
  const [data, setData] = useState<Museum | null>(null)
  const [error, setError] = useState('')
  const seq = useRef(0)
  const reload = useCallback(() => {
    const n = ++seq.current
    api<Museum>('/museum')
      .then((d) => { if (n === seq.current) { setData(d); setError('') } }) // drop stale responses
      .catch((e) => setError(errorText(e)))
  }, [])
  useEffect(reload, [reload])
  return { data, error, reload }
}

export function useUser() {
  const user = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => session.user)
  useEffect(() => {
    // picks up curator/admin rights granted since the last visit
    if (session.token) api<{ user: User }>('/me').then((r) => setSession(session.token, r.user)).catch((e) => e.status === 401 && logout())
  }, [])
  return user
}
