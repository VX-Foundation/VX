import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  adapter: 'node',
  build: {
    targets: ['browser', 'server'],
    sourceMaps: 'linked',
    deterministic: true,
    reproducible: true,
    incremental: true,
    bundleAnalysis: true
  }
});
