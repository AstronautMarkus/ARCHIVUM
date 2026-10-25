import { useState, type FormEvent } from 'react'
import { api, errorText, setSession, type User } from './api'

export function AuthForm({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const json = Object.fromEntries(new FormData(e.currentTarget))
    setBusy(true)
    try {
      const r = await api<{ token: string; user: User }>(`/${mode}`, { method: 'POST', json })
      setSession(r.token, r.user)
      onDone?.()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const login = mode === 'login'
  return (
    <form className="panel" onSubmit={submit}>
      <h2>{login ? 'Entrar' : 'Crear cuenta'}</h2>
      {!login && <label>Nombre (lo verán los demás)<input name="name" required maxLength={24} /></label>}
      <label>Email<input name="email" type="email" required autoComplete="email" /></label>
      <label>
        Contraseña
        <input name="password" type="password" required minLength={8} autoComplete={login ? 'current-password' : 'new-password'} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{login ? 'Entrar' : 'Registrarme'}</button>
      <button type="button" className="link" onClick={() => { setMode(login ? 'register' : 'login'); setError('') }}>
        {login ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
      </button>
      {onDone && <button type="button" className="link" onClick={onDone}>Cancelar</button>}
    </form>
  )
}
