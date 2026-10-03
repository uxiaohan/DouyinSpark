import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const API = process.env.API_PROXY ?? 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': { target: API, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
