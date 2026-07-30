import type { QueryClient, QueryDescriptor, QueryError } from '@vx/runtime';

export interface InfiniteQueryOptions<TPageParam, TPage> {
  name: string;
  initialPageParam: TPageParam;
  query: (pageParam: TPageParam, signal: AbortSignal) => TPage | Promise<TPage>;
  getNextPageParam?: (lastPage: TPage, pages: readonly TPage[]) => TPageParam | undefined;
  getPreviousPageParam?: (firstPage: TPage, pages: readonly TPage[]) => TPageParam | undefined;
  maxPages?: number;
  tags?: readonly string[];
  staleTimeMs?: number;
}

export interface InfiniteQuerySnapshot<TPageParam, TPage> {
  pages: readonly TPage[];
  pageParams: readonly TPageParam[];
  loading: boolean;
  fetchingNextPage: boolean;
  fetchingPreviousPage: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  error: QueryError | undefined;
}

export interface InfiniteQuery<TPageParam, TPage> {
  readonly snapshot: InfiniteQuerySnapshot<TPageParam, TPage>;
  fetchInitial(): Promise<TPage>;
  fetchNextPage(): Promise<TPage | undefined>;
  fetchPreviousPage(): Promise<TPage | undefined>;
  reset(): void;
  subscribe(listener: (snapshot: InfiniteQuerySnapshot<TPageParam, TPage>) => void): () => void;
}

export function createInfiniteQuery<TPageParam, TPage>(
  client: QueryClient,
  options: InfiniteQueryOptions<TPageParam, TPage>
): InfiniteQuery<TPageParam, TPage> {
  const pages: TPage[] = [];
  const pageParams: TPageParam[] = [];
  const listeners = new Set<(snapshot: InfiniteQuerySnapshot<TPageParam, TPage>) => void>();
  let loading = false;
  let direction: 'next' | 'previous' | undefined;
  let error: QueryError | undefined;

  const api: InfiniteQuery<TPageParam, TPage> = {
    get snapshot() { return snapshot(); },
    fetchInitial: () => fetch(options.initialPageParam, 'next', true) as Promise<TPage>,
    async fetchNextPage() {
      if (pages.length === 0) return api.fetchInitial();
      const parameter = options.getNextPageParam?.(pages[pages.length - 1]!, pages);
      return parameter === undefined ? undefined : fetch(parameter, 'next', false);
    },
    async fetchPreviousPage() {
      if (pages.length === 0) return api.fetchInitial();
      const parameter = options.getPreviousPageParam?.(pages[0]!, pages);
      return parameter === undefined ? undefined : fetch(parameter, 'previous', false);
    },
    reset() {
      pages.length = 0;
      pageParams.length = 0;
      error = undefined;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }
  };
  return api;

  async function fetch(parameter: TPageParam, nextDirection: 'next' | 'previous', reset: boolean): Promise<TPage> {
    if (loading) throw new Error(`Infinite query '${options.name}' is already fetching.`);
    loading = true;
    direction = nextDirection;
    error = undefined;
    emit();
    const descriptor: QueryDescriptor<TPageParam, TPage> = {
      name: `${options.name}:page`,
      input: () => parameter,
      source: (pageParam, context) => options.query(pageParam, context.signal),
      policy: { staleTimeMs: options.staleTimeMs ?? 0 },
      ...(options.tags ? { tags: options.tags } : {})
    };
    try {
      const page = await client.ensureQueryData(descriptor, parameter);
      if (reset) {
        pages.length = 0;
        pageParams.length = 0;
      }
      if (nextDirection === 'next') {
        pages.push(page);
        pageParams.push(parameter);
      } else {
        pages.unshift(page);
        pageParams.unshift(parameter);
      }
      trim(nextDirection);
      return page;
    } catch (caught) {
      error = normalizeError(caught);
      throw caught;
    } finally {
      loading = false;
      direction = undefined;
      emit();
    }
  }

  function trim(nextDirection: 'next' | 'previous'): void {
    const maxPages = Math.max(1, Math.floor(options.maxPages ?? Number.MAX_SAFE_INTEGER));
    while (pages.length > maxPages) {
      if (nextDirection === 'next') {
        pages.shift();
        pageParams.shift();
      } else {
        pages.pop();
        pageParams.pop();
      }
    }
  }

  function snapshot(): InfiniteQuerySnapshot<TPageParam, TPage> {
    return {
      pages: [...pages],
      pageParams: [...pageParams],
      loading,
      fetchingNextPage: loading && direction === 'next',
      fetchingPreviousPage: loading && direction === 'previous',
      hasNextPage: pages.length === 0 || options.getNextPageParam?.(pages[pages.length - 1]!, pages) !== undefined,
      hasPreviousPage: pages.length > 0 && options.getPreviousPageParam?.(pages[0]!, pages) !== undefined,
      error
    };
  }

  function emit(): void {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  }
}

function normalizeError(error: unknown): QueryError {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : 'Unknown infinite query failure',
    retryable: false,
    cause: error
  };
}
