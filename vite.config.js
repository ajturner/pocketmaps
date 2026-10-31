import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // MapLibre 6 loads its worker as a sibling module; keep it out of dep pre-bundling so that URL resolves in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
