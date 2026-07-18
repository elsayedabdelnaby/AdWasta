import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Control-plane dashboard (Phase 9). Proxies /api or hits the API base configured
// in the UI. Build output in web/dist (served by nginx in docker.md).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist' },
});
