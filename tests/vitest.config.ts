import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    exclude: [
      '**/*.spec.ts', 
      '**/node_modules/**', 
      '**/dist/**',
      'tests/accessibility/**',
      'tests/e2e/**',
      'tests/security/**',
      'tests/visual/**'
    ]
  }
});
