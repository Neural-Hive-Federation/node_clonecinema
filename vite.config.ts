import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // El servidor corre en modo middleware sobre Express; fijamos el puerto
    // del WebSocket para no chocar con otros Vite en la misma máquina.
    hmr: { port: 24690 },
  },
});
