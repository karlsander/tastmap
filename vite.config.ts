import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Static, fully client-side app. Overpass + OSM tiles are called from the browser.
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
