import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const API = 'http://127.0.0.1:4173'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/health': API,
      '/pnginfo': API,
      '/civitai': API,
      '/reload': API,
      '/comfy': API,
      '/workflows': API,
      '/templates': API,
      '/user-settings': API,
      '/user-models': API,
      '/jobs': API,
      '/generations': API,
    },
  },
})
