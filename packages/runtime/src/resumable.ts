import type { ClientHydrationState, HydrationDiagnostic } from './hydration.js';
import { createRangeHydrationRegistry, type HydrationRecoveryMode } from './hydration.js';

export interface ResumableBoundaryState {
  id: string;
  moduleId: string;
  state: unknown;
}

export interface ResumableBoundaryContext {
  readonly id: string;
  readonly start: Comment;
  readonly end: Comment;
  readonly state: unknown;
  readonly runtime: Readonly<Record<string, unknown>>;
  readonly hydration: ReturnType<typeof createRangeHydrationRegistry>;
}

export interface ResumableModule {
  __vxResume?: Readonly<{ id: string }>;
  resumeBoundary?: (context: ResumableBoundaryContext) => void | { dispose(): void } | Promise<void | { dispose(): void }>;
}

export interface ResumeBoundariesOptions {
  root: Element;
  state: ClientHydrationState;
  modules: Readonly<Record<string, () => Promise<ResumableModule>>>;
  runtime?: Readonly<Record<string, unknown>>;
  recovery?: HydrationRecoveryMode;
  onDiagnostic?: (diagnostic: HydrationDiagnostic, boundary: ResumableBoundaryState) => void;
  onError?: (error: unknown, boundary: ResumableBoundaryState) => void;
}

/** Reconnects serialized boundary state to existing server DOM without remounting it. */
export async function resumeBoundaries(options: ResumeBoundariesOptions): Promise<() => void> {
  const boundaries = normalizeBoundaries(options.state.resumable);
  if (boundaries.length === 0) return () => undefined;
  const ranges = findBoundaryRanges(options.root);
  const cache = new Map<string, Promise<ResumableModule>>();
  const disposables: Array<{ dispose(): void }> = [];
  let disposed = false;

  for (const boundary of boundaries) {
    if (disposed) break;
    const range = ranges.get(boundary.id);
    if (!range) {
      options.onError?.(new Error(`Unable to locate resumable VX boundary '${boundary.id}'.`), boundary);
      continue;
    }
    const hydration = createRangeHydrationRegistry(range.start, range.end, {
      recovery: options.recovery ?? 'patch',
      onDiagnostic: (diagnostic) => options.onDiagnostic?.(diagnostic, boundary),
      tolerateExternalMutations: true
    });
    try {
      const module = await resolveModule(boundary.moduleId, options.modules, cache);
      if (disposed) break;
      if (!module.resumeBoundary) throw new TypeError(`Resumable module '${boundary.moduleId}' does not export resumeBoundary().`);
      const result = await module.resumeBoundary(Object.freeze({
        id: boundary.id,
        start: range.start,
        end: range.end,
        state: boundary.state,
        runtime: options.runtime ?? Object.freeze({}),
        hydration
      }));
      hydration.finalize();
      if (result && typeof result.dispose === 'function') disposables.push(result);
    } catch (error) {
      options.onError?.(error, boundary);
    } finally {
      hydration.dispose();
    }
  }

  return () => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const disposable of disposables.splice(0).reverse()) {
      try { disposable.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Failed to dispose resumed VX boundaries.');
  };
}

interface BoundaryRange { start: Comment; end: Comment }

function findBoundaryRanges(root: Element): Map<string, BoundaryRange> {
  const ranges = new Map<string, BoundaryRange>();
  const starts = new Map<string, Comment[]>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    const start = /^vx:resume:(.+):start$/.exec(comment.data);
    if (start) {
      const values = starts.get(start[1]!) ?? [];
      values.push(comment);
      starts.set(start[1]!, values);
      continue;
    }
    const end = /^vx:resume:(.+):end$/.exec(comment.data);
    if (!end) continue;
    const values = starts.get(end[1]!);
    const startComment = values?.pop();
    if (startComment && startComment.parentNode === comment.parentNode) ranges.set(end[1]!, { start: startComment, end: comment });
  }
  return ranges;
}

async function resolveModule(
  moduleId: string,
  loaders: Readonly<Record<string, () => Promise<ResumableModule>>>,
  cache: Map<string, Promise<ResumableModule>>
): Promise<ResumableModule> {
  for (const [path, loader] of Object.entries(loaders).sort(([left], [right]) => left.localeCompare(right))) {
    let pending = cache.get(path);
    if (!pending) {
      pending = loader();
      cache.set(path, pending);
    }
    const module = await pending;
    if (module.__vxResume?.id === moduleId) return module;
  }
  throw new Error(`Unable to resolve resumable VX module '${moduleId}'.`);
}

function normalizeBoundaries(value: ClientHydrationState['resumable']): ResumableBoundaryState[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ResumableBoundaryState => isRecord(item)
    && typeof item['id'] === 'string'
    && typeof item['moduleId'] === 'string'
    && Object.prototype.hasOwnProperty.call(item, 'state'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
