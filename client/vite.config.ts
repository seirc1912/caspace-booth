import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    proxy: {
      // Keep the browser's Host so the API's same-origin check sees the real origin.
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
})