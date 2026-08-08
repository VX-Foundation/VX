import ts from 'typescript';

function getDirname(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/');
  const lastIndex = normalized.lastIndexOf('/');
  return lastIndex >= 0 ? normalized.slice(0, lastIndex) : '.';
}

const defaultCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  strict: false,
  noImplicitAny: false,
  noEmit: true,
  allowJs: true,
  skipLibCheck: true
};

/**
 * Loads TypeScript compiler options from a tsconfig.json file in the project root.
 * Falls back to default options if no tsconfig is found or if it fails to parse.
 */
export function loadTSConfig(rootDir: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  
  if (!configPath) {
    return { ...defaultCompilerOptions };
  }

  try {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    
    if (configFile.error) {
      console.warn(`VX TypeScript: Failed to read tsconfig.json at ${configPath}, using defaults`);
      return { ...defaultCompilerOptions };
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      getDirname(configPath)
    );

    if (parsed.errors.length > 0) {
      const hasFatalError = parsed.errors.some((e) => e.category === ts.DiagnosticCategory.Error);
      if (hasFatalError) {
        console.warn(`VX TypeScript: tsconfig.json has errors, using defaults`);
        return { ...defaultCompilerOptions };
      }
    }

    // Merge with defaults, letting tsconfig override specific options
    const mergedOptions: ts.CompilerOptions = {
      ...defaultCompilerOptions,
      ...parsed.options,
      // Ensure these options are always set for VX
      noEmit: true,
      skipLibCheck: true
    };
    
    // Only disable incremental if not a composite project
    if (!parsed.options.composite) {
      mergedOptions.incremental = false;
    }
    
    return mergedOptions;
  } catch (error) {
    console.warn(`VX TypeScript: Error loading tsconfig.json, using defaults:`, error);
    return { ...defaultCompilerOptions };
  }
}

/**
 * Creates a cache key for TS program compilation based on source and compiler options.
 */
export function createTSProgramCacheKey(source: string, options: ts.CompilerOptions): string {
  const optionsStr = JSON.stringify(options);
  return `${source}:${optionsStr}`;
}
