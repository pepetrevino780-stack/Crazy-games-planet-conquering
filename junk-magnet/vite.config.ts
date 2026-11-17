import { defineConfig } from 'vite';

// Relative base: CrazyGames serves the build from a sub-path.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
