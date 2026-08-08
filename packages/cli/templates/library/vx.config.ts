import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  adapter: 'static',
  styles: {
    mode: 'compiler'
  },
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
