import type { ExpressionNode, QueryDeclaration, QueryPolicyIR } from '@vx-foundation/types';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';

const DEFAULT_POLICY: QueryPolicyIR = Object.freeze({
  staleTimeMs: 0,
  retentionTimeMs: 5 * 60_000,
  retries: 2,
  retryDelayMs: 250,
  retryBackoff: 'exponential',
  execution: 'universal',
  networkMode: 'online',
  deduplicate: true,
  refreshOnFocus: false,
  refreshOnReconnect: true,
  refetchIntervalMs: 0,
  structuralSharing: true,
  persist: false,
  tags: Object.freeze([])
});

export function resolveQueryPolicy(
  declaration: QueryDeclaration,
  diagnostics: DiagnosticCollector
): QueryPolicyIR {
  const policy: QueryPolicyIR = { ...DEFAULT_POLICY, tags: [] };
  const seen = new Set<string>();

  for (const entry of declaration.policy) {
    if (seen.has(entry.name)) {
      diagnostics.error(
        'VX_QUERY_DUPLICATE_POLICY',
        `Query '${declaration.name}' defines policy '${entry.name}' more than once.`,
        entry.span,
        'Keep one value for each query policy.'
      );
      continue;
    }
    seen.add(entry.name);
    applyPolicyEntry(policy, declaration, entry.name, entry.expression, entry.span, diagnostics);
  }

  return policy;
}

function applyPolicyEntry(
  policy: QueryPolicyIR,
  declaration: QueryDeclaration,
  name: string,
  expression: ExpressionNode,
  span: QueryDeclaration['span'],
  diagnostics: DiagnosticCollector
): void {
  const source = expression.text.trim();
  switch (name) {
    case 'stale':
      policy.staleTimeMs = duration(source, name, declaration, span, diagnostics);
      return;
    case 'retain':
      policy.retentionTimeMs = duration(source, name, declaration, span, diagnostics);
      return;
    case 'retry':
      policy.retries = integer(source, name, declaration, span, diagnostics);
      return;
    case 'retryDelay':
      policy.retryDelayMs = duration(source, name, declaration, span, diagnostics);
      return;
    case 'backoff':
      if (source === 'fixed' || source === 'exponential') policy.retryBackoff = source;
      else invalid(name, source, declaration, span, diagnostics, "Use 'fixed' or 'exponential'.");
      return;
    case 'execute':
      if (source === 'universal' || source === 'server' || source === 'client') policy.execution = source;
      else invalid(name, source, declaration, span, diagnostics, "Use 'universal', 'server', or 'client'.");
      return;
    case 'network':
      if (source === 'online' || source === 'always') policy.networkMode = source;
      else if (source === 'offlineFirst' || source === 'offline-first') policy.networkMode = 'offline-first';
      else invalid(name, source, declaration, span, diagnostics, "Use 'online', 'always', or 'offlineFirst'.");
      return;
    case 'deduplicate':
      policy.deduplicate = boolean(source, name, declaration, span, diagnostics);
      return;
    case 'refreshOnFocus':
      policy.refreshOnFocus = boolean(source, name, declaration, span, diagnostics);
      return;
    case 'refreshOnReconnect':
      policy.refreshOnReconnect = boolean(source, name, declaration, span, diagnostics);
      return;
    case 'refreshInterval':
      policy.refetchIntervalMs = duration(source, name, declaration, span, diagnostics);
      return;
    case 'structuralSharing':
      policy.structuralSharing = boolean(source, name, declaration, span, diagnostics);
      return;
    case 'persist':
      policy.persist = boolean(source, name, declaration, span, diagnostics);
      return;
    case 'tags':
      policy.tags = stringArray(source, name, declaration, span, diagnostics);
      return;
    case 'enabled':
      policy.enabled = expression;
      return;
    default:
      diagnostics.error(
        'VX_QUERY_UNKNOWN_POLICY',
        `Unknown query policy '${name}' in query '${declaration.name}'.`,
        span,
        'Supported policies: stale, retain, retry, retryDelay, backoff, execute, network, deduplicate, refreshOnFocus, refreshOnReconnect, refreshInterval, structuralSharing, persist, tags, enabled.'
      );
  }
}

function duration(
  source: string,
  name: string,
  declaration: QueryDeclaration,
  span: QueryDeclaration['span'],
  diagnostics: DiagnosticCollector
): number {
  if (source === '0') return 0;
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(source);
  if (!match) {
    invalid(name, source, declaration, span, diagnostics, "Use zero or a duration literal such as '250ms', '30s', '5m', or '1h'.");
    return 0;
  }
  const value = Number(match[1]);
  const factor = match[2] === 'ms' ? 1 : match[2] === 's' ? 1_000 : match[2] === 'm' ? 60_000 : 3_600_000;
  return value * factor;
}

function integer(
  source: string,
  name: string,
  declaration: QueryDeclaration,
  span: QueryDeclaration['span'],
  diagnostics: DiagnosticCollector
): number {
  if (/^\d+$/.test(source)) return Number(source);
  invalid(name, source, declaration, span, diagnostics, 'Use a non-negative integer.');
  return 0;
}

function boolean(
  source: string,
  name: string,
  declaration: QueryDeclaration,
  span: QueryDeclaration['span'],
  diagnostics: DiagnosticCollector
): boolean {
  if (source === 'true') return true;
  if (source === 'false') return false;
  invalid(name, source, declaration, span, diagnostics, "Use 'true' or 'false'.");
  return false;
}

function stringArray(
  source: string,
  name: string,
  declaration: QueryDeclaration,
  span: QueryDeclaration['span'],
  diagnostics: DiagnosticCollector
): readonly string[] {
  try {
    const value = JSON.parse(source) as unknown;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new TypeError();
    return Object.freeze([...new Set(value.map((item) => item.trim()))].sort());
  } catch {
    invalid(name, source, declaration, span, diagnostics, 'Use a JSON string array such as ["users", "profile"].');
    return [];
  }
}

function invalid(
  name: string,
  source: string,
  declaration: QueryDeclaration,
  span: QueryDeclaration['span'],
  diagnostics: DiagnosticCollector,
  suggestion: string
): void {
  diagnostics.error(
    'VX_QUERY_INVALID_POLICY',
    `Query '${declaration.name}' has invalid value '${source}' for policy '${name}'.`,
    span,
    suggestion
  );
}
