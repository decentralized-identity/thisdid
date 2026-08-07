import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy the resolver API to the local Worker (`wrangler dev` on :8787).
// In prod the SPA is served by the Worker itself, so same-origin requests work.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/1.0': 'http://localhost:8787',
      '/methods': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
      '/openapi.json': 'http://localhost:8787',
      '/docs': 'http://localhost:8787',
      '/dashboard': 'http://localhost:8787',
      '/data': 'http://localhost:8787',
      '/recent': 'http://localhost:8787',
    },
  },
  build: { outDir: 'dist', sourcemap: false },
})
