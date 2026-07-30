export interface DocumentationEntry {
  slug: string;
  title: string;
  group: 'specification' | 'framework' | 'guides' | 'tutorials' | 'cookbook' | 'migration' | 'api';
  source: string;
}

export const documentationEntries: readonly DocumentationEntry[] = Object.freeze([
  { slug: 'specification', title: 'Language specification', group: 'specification', source: 'docs/spec/README.md' },
  { slug: 'framework', title: 'Framework documentation', group: 'framework', source: 'docs/framework/README.md' },
  { slug: 'api', title: 'API reference', group: 'api', source: 'docs/api/README.md' },
  { slug: 'security', title: 'Security guide', group: 'guides', source: 'docs/guides/security.md' },
  { slug: 'deployment', title: 'Deployment guide', group: 'guides', source: 'docs/guides/deployment.md' },
  { slug: 'performance', title: 'Performance guide', group: 'guides', source: 'docs/guides/performance.md' },
  { slug: 'accessibility', title: 'Accessibility guide', group: 'guides', source: 'docs/guides/accessibility.md' },
  { slug: 'package-authoring', title: 'Package authoring', group: 'guides', source: 'docs/guides/package-authoring.md' },
  { slug: 'plugin-authoring', title: 'Plugin authoring', group: 'guides', source: 'docs/guides/plugin-authoring.md' },
  { slug: 'official-applications', title: 'Official applications', group: 'framework', source: 'docs/framework/official-applications.md' }
]);

export function findDocumentationEntry(slug: string): DocumentationEntry | undefined {
  return documentationEntries.find((entry) => entry.slug === slug);
}
