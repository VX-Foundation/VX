import { defineConfig } from '@vx/core';

export default defineConfig({
  adapter: 'node',
  build: {
    targets: ['browser', 'server'],
    sourceMaps: 'linked',
    incremental: true,
    deterministic: true
  }
});
