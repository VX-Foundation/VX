import { defineConfig } from '@vx/core';

export default defineConfig({
  adapter: 'static',
  build: {
    targets: ['library'],
    deterministic: true,
    reproducible: true,
    library: {
      entry: ['src/components/Card.vx', 'src/modules/labels.vx'],
      formats: ['es']
    }
  }
});
