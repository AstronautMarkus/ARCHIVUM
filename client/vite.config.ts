import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // API_PROXY has no VITE_ prefix: it only configures the dev server and never reaches the browser
  const server = loadEnv(mode, process.cwd(), '').API_PROXY || 'http://127.0.0.1:8000'
  return {
    plugins: [react()],
    server: { proxy: { '/api': server, '/files': server, '/ws': { target: server.replace(/^http/, 'ws'), ws: true } } },
  }
})
