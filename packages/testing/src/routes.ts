export interface RouteHarness<TMatch, TNavigation = TMatch> {
  match(url: string): TMatch | null | Promise<TMatch | null>;
  navigate(url: string): TNavigation | Promise<TNavigation>;
}

export function createRouteHarness<TMatch, TNavigation = TMatch>(options: RouteHarness<TMatch, TNavigation>): RouteHarness<TMatch, TNavigation> {
  return Object.freeze({ ...options });
}

export interface InvocationResult<T> { value?: T; response?: Response; error?: unknown; }

export async function invokeAction<TInput, TOutput>(action: (input: TInput, request: Request) => TOutput | Promise<TOutput>, input: TInput, request = new Request('https://vx.test/action', { method: 'POST' })): Promise<InvocationResult<TOutput>> {
  try { return { value: await action(input, request) }; } catch (error) { return { error }; }
}

export async function invokeEndpoint(endpoint: (request: Request) => Response | Promise<Response>, request: Request): Promise<InvocationResult<never>> {
  try { return { response: await endpoint(request) }; } catch (error) { return { error }; }
}
