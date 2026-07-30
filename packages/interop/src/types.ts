export type InteropEnvironment = 'universal' | 'browser' | 'node' | 'server' | 'client';
export type InteropExportKind = 'function' | 'callback' | 'promise' | 'stream' | 'class' | 'value' | 'namespace';
export type InteropValueKind = 'unknown' | 'void' | 'boolean' | 'number' | 'bigint' | 'string' | 'bytes' | 'array' | 'record' | 'function' | 'promise' | 'stream' | 'class';
export type InteropErrorPolicy = 'throw' | 'result' | 'null';

export interface InteropTypeContract {
  kind: InteropValueKind;
  nullable?: boolean;
  optional?: boolean;
  element?: InteropTypeContract;
  fields?: Readonly<Record<string, InteropTypeContract>>;
}

export interface InteropParameter {
  name: string;
  type: InteropTypeContract;
}

export interface InteropDeclaration {
  module: string;
  exportName: string;
  kind: InteropExportKind;
  environment: InteropEnvironment;
  asynchronous?: boolean;
  pure?: boolean;
  sideEffects?: boolean;
  declaration?: string;
  parameters?: readonly InteropParameter[];
  returns?: InteropTypeContract;
  errorPolicy?: InteropErrorPolicy;
}

export interface InteropDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

export interface InteropModuleContract {
  module: string;
  environment: InteropEnvironment;
  exports: readonly InteropDeclaration[];
  sideEffects: boolean;
  declarations?: string;
}

export interface FFIOptions {
  environment?: InteropEnvironment;
  pure?: boolean;
  sideEffects?: boolean;
  asynchronous?: boolean;
  parameters?: readonly InteropParameter[];
  returns?: InteropTypeContract;
  errorPolicy?: InteropErrorPolicy;
}

export interface DisposableCallback<TArgs extends readonly unknown[] = readonly unknown[], TResult = unknown> {
  (...args: TArgs): TResult;
  readonly disposed: boolean;
  dispose(): void;
}

export interface ResolvedInteropPackage {
  specifier: string;
  packageName: string;
  packageVersion: string;
  packageRoot: string;
  entry: string;
  declarationsPath?: string;
  declarations?: string;
  environment: InteropEnvironment;
  sideEffects: boolean;
  treeShakable: boolean;
  usedConditions: readonly string[];
}
