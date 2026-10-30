import { useEffect, useRef, useState } from 'react'
import { errorText, unlockRoom } from './api'

const KEYS = [['1', '---'], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']]
const LEN = 4

// a square-wave beep, like the terminal's
function beep(freq: number, duration = 0.08, volume = 0.06) {
  try {
    const c = new AudioContext(), o = c.createOscillator(), g = c.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.value = volume
    o.connect(g).connect(c.destination)
    o.start()
    o.stop(c.currentTime + duration)
    o.onended = () => { c.close() }
  } catch { /* no audio */ }
}

// the door's keypad. The PIN is checked by the server; `onOpen` runs once it says it's right
export function Keypad({ room, title, onOpen, onClose }: { room: string; title: string; onOpen: () => void; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const busy = useRef(false)

  async function submit(pin: string) {
    if (busy.current) return
    if (pin.length !== LEN) return setResult({ ok: false, text: 'ERROR: ENTER 4 DIGITS' })
    busy.current = true
    try {
      await unlockRoom(room, pin)
      setResult({ ok: true, text: 'WELCOME, OPERATOR' })
      for (let i = 0; i < 2; i++) setTimeout(() => beep(1250, 0.09, 0.1), i * 150)
      setTimeout(() => { onOpen(); onClose() }, 700)
    } catch (e) {
      setResult({ ok: false, text: errorText(e).toUpperCase() })
      beep(260, 0.4, 0.1)
      setTimeout(() => { setCode(''); setResult(null); busy.current = false }, 1500)
    }
  }
  const press = (n: string) => {
    if (busy.current || code.length >= LEN) return
    beep(760 + Number(n) * 35, 0.055)
    setCode(code + n)
    setResult(null)
  }
  const erase = (all: boolean) => { if (!busy.current) { setCode(all ? '' : code.slice(0, -1)); setResult(null); beep(480, 0.045, 0.04) } }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Enter') submit(code)
      else if (e.key === 'Backspace') erase(false)
      else if (e.key === 'Escape') onClose()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  })

  const state = result ? (result.ok ? 'success unlocked' : 'failure') : ''
  const headline = result ? (result.ok ? 'ACCESS GRANTED' : 'ACCESS DENIED') : 'ENTER ACCESS CODE'
  const status = result?.text ?? (code.length === LEN ? 'PRESS ENTER TO VERIFY' : `CODE INPUT: ${code.length}/${LEN}`)
  return (
    <div className="kp">
      <div className="system-title">{title.toUpperCase()} // PRIVATE ROOM</div>
      <section className={`terminal ${state}`} aria-label="Teclado de la puerta">
        <div className="lightbar" />
        <div className="screen-frame"><div className="screen">
          <div className="screen-top"><span><i className="led" />SECURE LINK</span><span>DOOR</span></div>
          <div className="screen-content">
            <div className="big-label">{headline}</div>
            <div className="digits" aria-live="polite">{Array.from({ length: LEN }, (_, i) => (code[i] ? '▮' : '_')).join(' ')}</div>
          </div>
          <div className="status">{status}</div>
        </div></div>
        <div className="keypad">
          {KEYS.map(([n, sub]) => (
            <button key={n} className="key" onClick={() => press(n)}><span className="num">{n}</span><span className="sub">{sub}</span></button>
          ))}
          <button className="key utility" onClick={() => erase(true)} aria-label="Borrar todo"><span className="num">CLR</span><span className="sub">RESET</span></button>
          <button className="key" onClick={() => press('0')}><span className="num">0</span><span className="sub">+</span></button>
          <button className="key utility" onClick={() => erase(false)} aria-label="Borrar último"><span className="num">&#9003;</span><span className="sub">BACK</span></button>
        </div>
        <div className="actions">
          <button className="action" onClick={() => erase(true)}>CLEAR</button>
          <button className="action confirm" onClick={() => submit(code)}>&#9654; ENTER</button>
          <button className="action" onClick={onClose}>EXIT</button>
        </div>
      </section>
    </div>
  )
}
