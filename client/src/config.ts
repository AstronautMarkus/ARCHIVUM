// empty VITE_API_URL: the API lives on this same origin (Flask serves the build, Vite proxies it in dev)
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const LIVE_URL = API_URL
  ? `${API_URL.replace(/^http/, 'ws')}/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
