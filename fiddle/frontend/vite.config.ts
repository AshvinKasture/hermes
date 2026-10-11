import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/fiddle/',
  server: {
    proxy: {
      '/fiddle/api': {
        target: 'http://localhost:9121',
        changeOrigin: true,
      },
    },
  },
})
