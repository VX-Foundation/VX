export type DevtoolsCategory =
  | 'component' | 'state' | 'derive' | 'effect' | 'query' | 'action' | 'cache'
  | 'route' | 'hydration' | 'island' | 'boundary' | 'performance' | 'memory'
  | 'hmr' | 'server-payload';

export interface DevtoolsEntity {
  id: string;
  category: Exclude<DevtoolsCategory, 'performance' | 'memory' | 'hmr' | 'server-payload'>;
  name: string;
  parentId?: string;
  componentId?: string;
  status?: string;
  value?: unknown;
  metadata?: Readonly<Record<string, unknown>>;
  createdAt: number;
  updatedAt: number;
}

export interface DevtoolsMetric {
  id: string;
  category: 'performance' | 'memory';
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent';
  timestamp: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface DevtoolsEvent {
  sequence: number;
  timestamp: number;
  category: DevtoolsCategory;
  type: 'register' | 'update' | 'remove' | 'measure' | 'error' | 'snapshot';
  id?: string;
  payload?: unknown;
}

export interface DevtoolsSnapshot {
  protocolVersion: 1;
  applicationId: string;
  sequence: number;
  entities: readonly DevtoolsEntity[];
  metrics: readonly DevtoolsMetric[];
  hmr: readonly DevtoolsEvent[];
  serverPayloads: readonly DevtoolsEvent[];
}

export interface DevtoolsTransport {
  send(event: DevtoolsEvent): void;
  subscribe(listener: (event: DevtoolsEvent) => void): () => void;
}
