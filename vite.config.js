import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { ignavSearchPlugin } from './server/ignav.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ignavSearchPlugin(loadEnv(mode, root, 'IGNAV_').IGNAV_API_KEY),
  ],
  base: '/',
  server: {
    fs: { deny: ['.env*', '*.pem', '*.crt', '**/.git/**', '**/server/**'] },
  },
  build: { minify: false, cssMinify: false },
}));
