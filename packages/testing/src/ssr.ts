export interface MarkupMismatch {
  index: number;
  server: string;
  client: string;
  context: string;
  suggestion: string;
}

export interface HydrationTestResult {
  matched: boolean;
  serverMarkup: string;
  clientMarkup: string;
  mismatches: readonly MarkupMismatch[];
}

export async function assertDeterministicMarkup(render: () => string | Promise<string>, attempts = 3): Promise<string> {
  if (!Number.isSafeInteger(attempts) || attempts < 2) throw new TypeError('Deterministic SSR testing requires at least two attempts.');
  const values: string[] = [];
  for (let index = 0; index < attempts; index += 1) values.push(await render());
  const first = values[0] ?? '';
  const mismatch = values.findIndex((value) => value !== first);
  if (mismatch >= 0) throw new Error(`SSR output was not deterministic between attempt 1 and attempt ${mismatch + 1}.`);
  return first;
}

export function compareHydrationMarkup(serverMarkup: string, clientMarkup: string): HydrationTestResult {
  const server = tokenizeMarkup(serverMarkup);
  const client = tokenizeMarkup(clientMarkup);
  const mismatches: MarkupMismatch[] = [];
  const count = Math.max(server.length, client.length);
  for (let index = 0; index < count; index += 1) {
    const left = server[index] ?? '<missing>';
    const right = client[index] ?? '<missing>';
    if (left === right) continue;
    mismatches.push({
      index,
      server: left,
      client: right,
      context: server.slice(Math.max(0, index - 2), index + 3).join(' '),
      suggestion: left === '<missing>' || right === '<missing>'
        ? 'Check conditional rendering and third-party DOM mutations before hydration.'
        : 'Ensure server and client state, locale, time, and generated identifiers are deterministic.'
    });
    if (mismatches.length >= 20) break;
  }
  return Object.freeze({ matched: mismatches.length === 0, serverMarkup, clientMarkup, mismatches: Object.freeze(mismatches) });
}

export async function testHydration(options: {
  serverMarkup: string;
  hydrate(): void | Promise<void>;
  readClientMarkup(): string;
}): Promise<HydrationTestResult> {
  await options.hydrate();
  return compareHydrationMarkup(options.serverMarkup, options.readClientMarkup());
}

function tokenizeMarkup(source: string): string[] {
  return source
    .replace(/<!--(?!vx:)[\s\S]*?-->/gu, '')
    .match(/<!--vx:[\s\S]*?-->|<[^>]+>|[^<]+/gu)
    ?.map((token) => token.startsWith('<') ? token.replace(/\s+/gu, ' ').trim() : token.replace(/\s+/gu, ' ').trim())
    .filter(Boolean) ?? [];
}
