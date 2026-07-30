import { describe, expect, it } from 'vitest';
import { buildRouteHref, buildRoutePath } from '../src/runtime/params.js';
import { executeMatch, matchRoute } from '../src/runtime/matcher.js';
import { compareRouteSpecificity, parseRoutePath } from '../src/build/segments.js';

describe('route matching and links', () => {
  it('matches compatibility static, dynamic, and catch-all patterns', () => {
    expect(executeMatch('/about', '/about')).toEqual({});
    expect(executeMatch('/users/:id', '/users/123')).toEqual({ id: '123' });
    expect(executeMatch('/docs/*path', '/docs/guide/start')).toEqual({ path: 'guide/start' });
    expect(executeMatch('/docs/*path?', '/docs')).toEqual({});
  });

  it('decodes typed parameters and rejects incompatible values', () => {
    const integer = parseRoutePath(['users', '[id.integer]']);
    const boolean = parseRoutePath(['flags', '[enabled.boolean]']);
    const routes = [
      { id: 'user', ...integer },
      { id: 'flag', ...boolean }
    ];
    expect(matchRoute('/users/42', routes)?.params).toEqual({ id: 42 });
    expect(matchRoute('/users/not-a-number', routes)).toBeNull();
    expect(matchRoute('/flags/true', routes)?.params).toEqual({ enabled: true });
  });

  it('orders routes by segment specificity instead of aggregate score', () => {
    const staticFirst = parseRoutePath(['users', '[id]']);
    const dynamicFirst = parseRoutePath(['[section]', 'new']);
    const exact = parseRoutePath(['docs']);
    const optionalCatchAll = parseRoutePath(['docs', '[[...path]]']);
    expect([dynamicFirst, staticFirst].sort(compareRouteSpecificity)[0]).toBe(staticFirst);
    expect([optionalCatchAll, exact].sort(compareRouteSpecificity)[0]).toBe(exact);
  });

  it('builds validated route paths, query strings, and hashes', () => {
    const route = parseRoutePath(['users', '[id.integer]']);
    expect(buildRoutePath(route, { id: 7 })).toBe('/users/7');
    const encodedStatic = parseRoutePath(['team space']);
    expect(encodedStatic.path).toBe('/team%20space');
    expect(buildRoutePath(encodedStatic, {})).toBe('/team%20space');
    expect(buildRouteHref(route, { id: 7 }, { query: { tab: 'activity', filter: ['open', 'new'] }, hash: 'details' }))
      .toBe('/users/7?tab=activity&filter=open&filter=new#details');
    expect(() => buildRoutePath(route, { id: 7.5 })).toThrow(/safe integer/);
  });
});
