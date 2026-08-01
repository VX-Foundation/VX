import { defineConfig } from '@vx-foundation/core';

export default defineConfig({
  adapter: 'static',
  integrations: [{ name: '@vx-foundation/plugins/sitemap', options: { site: 'https://example.com' } }]
});
