import { defineConfig } from 'vitest/config';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Static, fully client-side app. Overpass + OSM tiles are called from the browser.
  // `plugins` is present (even if empty) so Cloudflare's build auto-config can
  // inject its Vite plugin.
  plugins: [cloudflare()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});