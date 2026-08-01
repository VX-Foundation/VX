import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  adapter: 'static',
  build: {
    targets: ['browser', 'server', 'static'],
    deterministic: true,
    reproducible: true,
    incremental: true,
    bundleAnalysis: true
  }
});
