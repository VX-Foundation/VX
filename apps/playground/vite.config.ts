import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === 'UNRESOLVED_IMPORT' ||
          (warning.message && warning.message.includes('externalized for browser compatibility'))
        ) {
          return;
        }
        warn(warning);
      }
    }
  }
});
