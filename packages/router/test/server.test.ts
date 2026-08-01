import { describe, expect, it } from 'vitest';
import { renderElement, renderStructuralRange } from '@vx-foundation/runtime/server';
import { parseRoutePath } from '../src/build/segments.js';
import { createServerApplication } from '../src/runtime/server.js';
import type { RuntimeServerRouteRecord, VXServerRouteComponentModule } from '../src/types.js';

describe('server application', () => {
  it('renders an isolated request document with security headers', async () => {
    const application = createServerApplication({ routes: [route('home', [], page('Home'))], clientEntry: '/client.js' });
    const response = await application.render('https://vx.test/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain('nonce-');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    const html = await response.text();
    expect(html).toContain('data-vx-ssr="home"');
    expect(html).toContain('id="__VX_STATE__"');
    expect(html).toContain('src="/client.js"');
  });

  it('renders a route error boundary before disposing request state', async () => {
    const record = route('failure', ['failure'], {
      renderComponent: async () => { throw new Error('private failure'); }
    });
    record.loadError = async () => ({
      renderComponent: async (props) => {
        const error = props['error'] as { message: string };
        return renderElement('h1', {}, `Boundary ${error.message}`, 'route-error', 'Title');
      }
    });
    const application = createServerApplication({ routes: [record] });
    const response = await application.render('https://vx.test/failure');
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Boundary The route could not be rendered.');
  });

  it('streams deferred boundaries before closing hydration state', async () => {
    const module: VXServerRouteComponentModule = {
      renderComponent: async (_props, contextValue) => {
        const context = contextValue as { defer(id: string, promise: Promise<string>): void };
        context.defer('slow', Promise.resolve('<strong>Done</strong>'));
        return renderStructuralRange('stream', 'slow', '<span>Loading</span>');
      }
    };
    const application = createServerApplication({ routes: [route('stream', ['stream'], module, 'stream')] });
    const response = await application.render('https://vx.test/stream');
    expect(response.headers.get('content-security-policy')).toContain('nonce-');
    const html = await response.text();
    expect(html).toContain('Loading');
    expect(html).toContain('data-vx-stream');
    expect(html).toContain('Done');
    expect(html).toContain('__VX_STATE__');
  });
});

function page(label: string): VXServerRouteComponentModule {
  return { renderComponent: async () => renderElement('h1', {}, label, 'title', 'Title') };
}

function route(
  id: string,
  segments: string[],
  module: VXServerRouteComponentModule,
  streaming: 'blocking' | 'stream' = 'blocking'
): RuntimeServerRouteRecord {
  const parsed = parseRoutePath(segments);
  return {
    id, ...parsed, pagePath: `/src/pages/${id}.vx`, layoutPaths: [], boundaries: {},
    policy: {
      render: 'server', preload: 'none', hydration: 'full', streaming,
      generation: { mode: 'dynamic', entries: [] }, metadata: {},
      preserve: { state: false, scroll: true, focus: true }
    },
    queries: [], actions: [], score: parsed.score, loadPage: async () => module, loadLayouts: []
  };
}
