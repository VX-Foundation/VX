import { defineConfig } from '@vx/core';

export default defineConfig({
  adapter: 'static',
  integrations: [{ name: '@vx/plugins/sitemap', options: { site: 'https://example.com' } }]
});
