import type { RuntimeServerRouteRecord } from '../types.js';
import { buildRoutePath } from '../runtime/params.js';

export interface StaticGenerationEntry {
  routeId: string;
  pathname: string;
  revalidateSeconds?: number;
}

export function generateStaticEntries(routes: readonly RuntimeServerRouteRecord[]): StaticGenerationEntry[] {
  const entries: StaticGenerationEntry[] = [];
  for (const route of routes) {
    if (route.policy.generation.mode === 'dynamic' || route.policy.redirect || !route.pagePath) continue;
    if (route.parameters.length === 0) {
      entries.push(entry(route, route.path));
      continue;
    }
    if (route.policy.generation.entries.length === 0) {
      throw new Error(`Static route '${route.path}' requires generation.entries for its dynamic parameters.`);
    }
    for (const params of route.policy.generation.entries) entries.push(entry(route, buildRoutePath(route, params)));
  }
  return entries;
}

function entry(route: RuntimeServerRouteRecord, pathname: string): StaticGenerationEntry {
  return {
    routeId: route.id,
    pathname,
    ...(route.policy.generation.revalidateSeconds !== undefined ? { revalidateSeconds: route.policy.generation.revalidateSeconds } : {})
  };
}
