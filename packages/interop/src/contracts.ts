import type { InteropDeclaration, InteropDiagnostic, InteropEnvironment, InteropModuleContract, InteropTypeContract } from './types.js';

export function defineInteropModule(contract: InteropModuleContract): InteropModuleContract {
  const diagnostics = validateInteropModule(contract);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) throw new TypeError(errors.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`).join('\n'));
  return Object.freeze({ ...contract, exports: Object.freeze(contract.exports.map((item) => freezeDeclaration(item))) });
}

export function validateInteropModule(contract: InteropModuleContract): InteropDiagnostic[] {
  const diagnostics: InteropDiagnostic[] = [];
  if (!validModuleSpecifier(contract.module)) diagnostics.push(error('VX_INTEROP_MODULE', `Invalid module specifier '${contract.module}'.`, 'Use an npm package name or safe relative module path.'));
  if (!Array.isArray(contract.exports) || contract.exports.length > 10_000) diagnostics.push(error('VX_INTEROP_EXPORT_COUNT', `Module '${contract.module}' has an invalid number of exports.`));
  const names = new Set<string>();
  for (const declaration of contract.exports ?? []) {
    if (declaration.module !== contract.module) diagnostics.push(error('VX_INTEROP_EXPORT_MODULE', `Export '${declaration.exportName}' belongs to '${declaration.module}', not '${contract.module}'.`));
    if (!validExportName(declaration.exportName)) diagnostics.push(error('VX_INTEROP_EXPORT', `Invalid export name '${declaration.exportName}'.`));
    if (names.has(declaration.exportName)) diagnostics.push(error('VX_INTEROP_DUPLICATE', `Export '${declaration.exportName}' is declared more than once.`));
    names.add(declaration.exportName);
    if (!environmentCompatible(contract.environment, declaration.environment)) diagnostics.push(error('VX_INTEROP_ENVIRONMENT', `Export '${declaration.exportName}' targets '${declaration.environment}' but module '${contract.module}' targets '${contract.environment}'.`));
    if (declaration.pure === true && declaration.sideEffects === true) diagnostics.push(error('VX_INTEROP_PURITY', `Export '${declaration.exportName}' cannot be both pure and side-effectful.`));
    if (declaration.kind === 'promise' && declaration.asynchronous === false) diagnostics.push(error('VX_INTEROP_PROMISE_ASYNC', `Promise export '${declaration.exportName}' must be asynchronous.`));
    if (declaration.parameters) {
      const parameterNames = new Set<string>();
      for (const parameter of declaration.parameters) {
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(parameter.name) || parameterNames.has(parameter.name)) diagnostics.push(error('VX_INTEROP_PARAMETER', `Export '${declaration.exportName}' has invalid or duplicate parameter '${parameter.name}'.`));
        parameterNames.add(parameter.name);
        validateType(parameter.type, `${declaration.exportName}.${parameter.name}`, diagnostics, 0);
      }
    }
    if (declaration.returns) validateType(declaration.returns, `${declaration.exportName}.return`, diagnostics, 0);
  }
  if (!contract.sideEffects && contract.exports.some((item) => item.sideEffects === true)) diagnostics.push(error('VX_INTEROP_MODULE_EFFECTS', `Module '${contract.module}' is marked side-effect free but contains side-effectful exports.`));
  return diagnostics;
}

export function assertInteropBoundary(importer: InteropEnvironment, imported: InteropEnvironment, module: string): void {
  if (environmentCompatible(importer, imported)) return;
  const side = imported === 'node' || imported === 'server' ? 'server-only' : 'client-only';
  throw new Error(`Cannot import ${side} module '${module}' from '${importer}' code.`);
}

export function treeShakeInterop(contract: InteropModuleContract, usedExports: ReadonlySet<string>): InteropModuleContract {
  if (contract.sideEffects) return contract;
  const exports = contract.exports.filter((item) => usedExports.has(item.exportName) || item.sideEffects === true);
  return Object.freeze({ ...contract, exports: Object.freeze(exports) });
}

export function environmentCompatible(importer: InteropEnvironment, imported: InteropEnvironment): boolean {
  if (importer === 'universal') return imported === 'universal';
  if (imported === 'universal' || importer === imported) return true;
  if ((importer === 'browser' || importer === 'client') && (imported === 'browser' || imported === 'client')) return true;
  return (importer === 'node' || importer === 'server') && (imported === 'node' || imported === 'server');
}

function validateType(type: InteropTypeContract, label: string, diagnostics: InteropDiagnostic[], depth: number): void {
  if (depth > 16) { diagnostics.push(error('VX_INTEROP_TYPE_DEPTH', `Interop type '${label}' exceeds the nesting limit.`)); return; }
  if (type.kind === 'array' || type.kind === 'promise' || type.kind === 'stream') {
    if (!type.element) diagnostics.push(error('VX_INTEROP_TYPE_ELEMENT', `Interop type '${label}' requires an element contract.`));
    else validateType(type.element, `${label}[]`, diagnostics, depth + 1);
  } else if (type.element) diagnostics.push(error('VX_INTEROP_TYPE_ELEMENT_UNEXPECTED', `Interop type '${label}' cannot declare an element contract.`));
  if (type.kind === 'record') {
    if (!type.fields) diagnostics.push(error('VX_INTEROP_TYPE_FIELDS', `Record type '${label}' requires fields.`));
    else for (const [name, field] of Object.entries(type.fields)) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) diagnostics.push(error('VX_INTEROP_TYPE_FIELD', `Record type '${label}' has invalid field '${name}'.`));
      validateType(field, `${label}.${name}`, diagnostics, depth + 1);
    }
  } else if (type.fields) diagnostics.push(error('VX_INTEROP_TYPE_FIELDS_UNEXPECTED', `Interop type '${label}' cannot declare fields.`));
}
function freezeDeclaration(declaration: InteropDeclaration): InteropDeclaration {
  return Object.freeze({ ...declaration, ...(declaration.parameters ? { parameters: Object.freeze(declaration.parameters.map((parameter) => Object.freeze({ ...parameter }))) } : {}) });
}
function validModuleSpecifier(value: string): boolean { return Boolean(value) && value.length <= 2048 && !/[\0\r\n\\]/.test(value) && !/^(?:https?|data):/.test(value) && !value.split('/').includes('..'); }
function validExportName(value: string): boolean { return value === 'default' || /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value); }
function error(code: string, message: string, suggestion?: string): InteropDiagnostic { return { code, severity: 'error', message, ...(suggestion ? { suggestion } : {}) }; }
