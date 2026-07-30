import type { ServerRenderContext } from '@vx/runtime/server';
import type { RouteLocation, RuntimeServerRouteRecord, VXServerRouteComponentModule } from '../types.js';

export async function loadServerRouteModules(route: RuntimeServerRouteRecord, signal: AbortSignal): Promise<{ page: VXServerRouteComponentModule; layouts: VXServerRouteComponentModule[] }> {
  if (!route.loadPage) throw new Error(`Route '${route.id}' does not provide a server page loader.`);
  const [page, layouts] = await Promise.all([route.loadPage(), Promise.all(route.loadLayouts.map((load) => load()))]);
  if (signal.aborted) throw signal.reason ?? new DOMException('Request aborted.', 'AbortError');
  return { page, layouts };
}

export async function renderModule(
  module: VXServerRouteComponentModule,
  props: Readonly<Record<string, unknown>>,
  context: ServerRenderContext,
  content: Readonly<Record<string, unknown>>
): Promise<string> {
  if (!module.renderComponent) throw new TypeError('VX server route module does not export renderComponent().');
  return module.renderComponent(props, context, content);
}

export function routeProps(location: RouteLocation, data: Readonly<Record<string, unknown>> = Object.freeze({})): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...location.params, route: location, search: location.searchValues ?? location.search, hash: location.hash, data });
}

