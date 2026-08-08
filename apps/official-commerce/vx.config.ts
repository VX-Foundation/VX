import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  adapter: 'node',
  styles: {
    mode: 'compiler'
  },
  build: {
    targets: ['browser', 'server', 'static'],
    sourceMaps: 'linked',
    deterministic: true,
    reproducible: true,
    incremental: true,
    bundleAnalysis: true,
    assets: {
      integrity: 'sha384',
      preload: true,
      prefetch: true,
      publicAssetMode: 'both',
      optimize: true
    }
  }
});
