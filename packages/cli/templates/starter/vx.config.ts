import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  adapter: 'node',
  build: {
    targets: ['browser', 'server'],
    sourceMaps: 'linked',
    incremental: true,
    deterministic: true,
    bundleAnalysis: true
  }
});
