import { analyze, lower } from '@vx-foundation/compiler/core';
import { parse } from '@vx-foundation/language';
import type { Diagnostic, ViewSourceMapEntry } from '@vx-foundation/types';

export interface ComponentHarness {
  filePath: string;
  diagnostics: Diagnostic[];
  clientCode?: string;
  serverCode?: string;
  sourceMap: ViewSourceMapEntry[];
  assertValid(): void;
  findGeneratedForLine(line: number): ViewSourceMapEntry[];
}

/** Compiles an in-memory component with the production parser/analyzer/lowerer. */
export function createComponentHarness(source: string, filePath = '/virtual/Component.vx'): ComponentHarness {
  const parsed = parse(source, filePath);
  const analysis = analyze(parsed.ast);
  const diagnostics = [...parsed.diagnostics, ...analysis.diagnostics];
  let clientCode: string | undefined;
  let serverCode: string | undefined;
  let sourceMap: ViewSourceMapEntry[] = [];
  if (!diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const generated = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
    clientCode = generated.clientCode;
    serverCode = generated.serverCode;
    sourceMap = generated.viewSourceMap;
  }
  return {
    filePath, diagnostics,
    ...(clientCode !== undefined ? { clientCode } : {}),
    ...(serverCode !== undefined ? { serverCode } : {}),
    sourceMap,
    assertValid() {
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
      if (errors.length > 0) throw new Error(errors.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`).join('\n'));
    },
    findGeneratedForLine(line: number) {
      return sourceMap.filter((entry) => entry.span.start.line <= line && entry.span.end.line >= line);
    }
  };
}

export async function withBrowserFixture<T>(
  html: string,
  createDocument: (html: string) => Document,
  run: (document: Document) => T | Promise<T>
): Promise<T> {
  const document = createDocument(html);
  return run(document);
}
