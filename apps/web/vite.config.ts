import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin requests in the browser: no CORS configuration needed on the API.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
