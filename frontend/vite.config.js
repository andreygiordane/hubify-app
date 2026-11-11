import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em desenvolvimento (npm run dev), repassa para os containers do docker compose
const API_TARGET = process.env.DEV_API_TARGET || 'http://localhost:8082'
const SOCKET_TARGET = process.env.DEV_SOCKET_TARGET || 'http://localhost:8080'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API_TARGET,
      '/ice-servers': SOCKET_TARGET,
      '/push': SOCKET_TARGET,
      '/hubify-ca.crt': SOCKET_TARGET,
      '/socket.io': { target: SOCKET_TARGET, ws: true },
    },
  },
})
