import type { RouteCatalog, RouteHrefOptions, RouteRecord, RouteReference } from '../types.js';
import { buildRouteHref } from './params.js';

export function createRouteCatalog(routes: readonly RouteRecord[]): RouteCatalog {
  const byId: Record<string, RouteReference> = {};
  const byName: Record<string, RouteReference> = {};
  for (const route of routes) {
    const name = route.name ?? route.id;
    const reference: RouteReference = Object.freeze({
      id: route.id,
      name,
      path: route.path,
      build(params: Readonly<Record<string, unknown>> = {}, options: RouteHrefOptions = {}) {
        return buildRouteHref(route, params as never, options);
      }
    });
    if (byId[route.id]) throw new Error(`Route id '${route.id}' is duplicated.`);
    if (byName[name]) throw new Error(`Route name '${name}' is duplicated.`);
    byId[route.id] = reference;
    byName[name] = reference;
  }
  return Object.freeze({
    byId: Object.freeze(byId),
    byName: Object.freeze(byName),
    get(idOrName: string) {
      const reference = byId[idOrName] ?? byName[idOrName];
      if (!reference) throw new Error(`Unknown route '${idOrName}'.`);
      return reference;
    }
  });
}
