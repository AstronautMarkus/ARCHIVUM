import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': SERVER, '/files': SERVER, '/ws': { target: 'ws://127.0.0.1:8000', ws: true } } },
})
