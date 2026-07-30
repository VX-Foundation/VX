import { defineConfig } from '@vx/core';

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
