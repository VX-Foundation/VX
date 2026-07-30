import { describe, expectTypeOf, it } from 'vitest';

import type {
  ASTNode,
  Diagnostic,
  Integration,
  IntegrationContext,
  SourceSpan,
  VXConfig
} from '../src/index.js';

describe('@vx/types', () => {
  it('exposes the minimal diagnostic contract', () => {
    expectTypeOf<Diagnostic>().toMatchTypeOf<{
      code: string;
      message: string;
      severity: 'error' | 'warning' | 'info';
      span: SourceSpan;
    }>();
  });

  it('exposes an AST node shape usable across packages', () => {
    expectTypeOf<ASTNode>().toMatchTypeOf<{
      kind: string;
      span: SourceSpan;
    }>();
  });

  it('exposes the base project configuration shape', () => {
    expectTypeOf<VXConfig>().toMatchTypeOf<{
      root: string;
      srcDir: string;
      outDir: string;
      adapter: string | { name: string };
      integrations: Array<{ name: string }>;
      build?: unknown;
      plugins?: unknown;
      experimental?: unknown;
    }>();
  });

  it('keeps the integration contract isolated from the rest of the compiler', () => {
    expectTypeOf<Integration['name']>().toEqualTypeOf<string>();
    expectTypeOf<Parameters<Integration['setup']>>().toEqualTypeOf<[IntegrationContext]>();
    expectTypeOf<ReturnType<Integration['setup']>>().toEqualTypeOf<void | Promise<void>>();
  });
});
