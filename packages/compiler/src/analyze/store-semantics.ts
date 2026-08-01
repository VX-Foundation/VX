import type { StoreDeclaration } from '@vx-foundation/types';
import type { DiagnosticCollector } from './diagnostics.js';

export function validateStoreDeclaration(store: StoreDeclaration, diagnostics: DiagnosticCollector): void {
  if (!store.from.trim()) {
    diagnostics.error(
      'VX_STORE_EMPTY_KEY',
      `Store '${store.name}' requires a non-empty registry key.`,
      store.span,
      'Provide a stable quoted store key after from.'
    );
  }

  if (store.side === 'client' && store.lifetime === 'request') {
    diagnostics.error(
      'VX_STORE_LIFETIME_TARGET',
      `Client store '${store.name}' cannot use request lifetime.`,
      store.span,
      "Use component, tree, route, session, application, or manual lifetime."
    );
  }

  if (store.side === 'server' && store.lifetime !== 'request' && store.lifetime !== 'manual') {
    diagnostics.error(
      'VX_STORE_SERVER_ISOLATION',
      `Server store '${store.name}' uses unsafe lifetime '${store.lifetime}'.`,
      store.span,
      "Use request lifetime for user/request data. Manual lifetime is reserved for explicitly managed infrastructure."
    );
  }
}
