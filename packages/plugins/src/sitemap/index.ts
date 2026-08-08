import type { Integration } from '@vx-foundation/types';

export interface SitemapOptions {
  site: string;
  exclude?: readonly string[];
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export default function sitemap(options: SitemapOptions): Integration {
  const site = normalizeSite(options?.site);
  return {
    name: '@vx-foundation/sitemap',
    manifest: {
      name: '@vx-foundation/sitemap', version: '0.2.0', apiVersion: '1',
      capabilities: ['build', 'emit-file'], permissions: ['read-project', 'write-output'], deterministic: true
    },
    setup(context) {
      context.registerHook('buildEnd', async (hook) => {
        const xml = await context.cache(`sitemap:${site}:${JSON.stringify(options.exclude ?? [])}`, async () => {
          if (!hook.outDir) throw new Error('Sitemap generation requires a build output directory.');
          const manifest = await context.readProjectFile(`${hook.outDir}/vx.routes.json`);
          return generateSitemap(manifest, site, options);
        });
        context.emitFile('sitemap.xml', xml);
      });
    }
  };
}

function generateSitemap(manifest: string, site: string, options: SitemapOptions): string {
  const parsed: unknown = JSON.parse(manifest);
  if (!record(parsed) || !Array.isArray(parsed['routes'])) throw new Error('Invalid VX route manifest.');
  const excluded = new Set(options.exclude ?? []);
  const routes = parsed['routes'].flatMap((route) => {
    if (!record(route) || typeof route['pathname'] !== 'string') return [];
    const pathname = route['pathname'];
    if (pathname.includes(':') || pathname.includes('*') || excluded.has(pathname)) return [];
    return [pathname];
  }).sort();
  const changefreq = options.changefreq ? `\n    <changefreq>${options.changefreq}</changefreq>` : '';
  const priority = options.priority !== undefined ? `\n    <priority>${validatePriority(options.priority)}</priority>` : '';
  const urls = routes.map((pathname) => `  <url>\n    <loc>${escapeXml(new URL(pathname, site).toString())}</loc>${changefreq}${priority}\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
function normalizeSite(value: string | undefined): string {
  if (!value) throw new TypeError("Sitemap plugin requires an absolute 'site' URL.");
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new TypeError('Sitemap site must use HTTP or HTTPS.');
  return url.toString();
}
function validatePriority(value: number): string { if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError('Sitemap priority must be between 0 and 1.'); return String(value); }
function escapeXml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
