import type { Integration } from '@vx-foundation/types';

const ISOLATED_INTEGRATION = Symbol.for('@vx-foundation/plugins/isolated-integration');

export interface IsolatedIntegrationMetadata {
  sourceIntegrity: string;
  moduleSpecifier: string;
}

type TaggedIntegration = Integration & { [ISOLATED_INTEGRATION]?: IsolatedIntegrationMetadata };

export function markIsolatedIntegration(integration: Integration, metadata: IsolatedIntegrationMetadata): Integration {
  Object.defineProperty(integration, ISOLATED_INTEGRATION, { value: Object.freeze({ ...metadata }), configurable: false, enumerable: false, writable: false });
  return integration;
}

export function isolatedIntegrationMetadata(integration: Integration): IsolatedIntegrationMetadata | undefined {
  return (integration as TaggedIntegration)[ISOLATED_INTEGRATION];
}
