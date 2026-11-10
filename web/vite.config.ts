import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: { proxy: { '/api': 'http://127.0.0.1:8765' } },
  build: { outDir: '../app/static', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
})
