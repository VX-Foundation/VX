import ts from 'typescript';

/** Normalize backslashes to forward slashes (ts.normalizePath is internal/not typed). */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export interface VirtualFileStore {
  getFile(path: string): string | undefined;
  hasFile(path: string): boolean;
}

/**
 * Creates a hybrid TypeScript CompilerHost that serves virtual .vx.ts files
 * from memory while delegating real files (node_modules, tsconfig, libs) to ts.sys.
 */
export function createVirtualCompilerHost(
  options: ts.CompilerOptions,
  virtualFiles: Map<string, string>
): ts.CompilerHost {
  const defaultHost = ts.createCompilerHost(options);

  return {
    ...defaultHost,
    getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) {
      const normalizedPath = normalizePath(fileName);
      if (virtualFiles.has(normalizedPath)) {
        return ts.createSourceFile(
          normalizedPath,
          virtualFiles.get(normalizedPath)!,
          options.target ?? ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS
        );
      }
      return defaultHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    },
    fileExists(fileName) {
      const normalizedPath = normalizePath(fileName);
      return virtualFiles.has(normalizedPath) || defaultHost.fileExists(fileName);
    },
    readFile(fileName) {
      const normalizedPath = normalizePath(fileName);
      return virtualFiles.get(normalizedPath) ?? defaultHost.readFile(fileName);
    }
  };
}
