import type { Cleanup } from './dom.js';

export type TokenPrimitive = string | number;
export type TokenKind = 'color' | 'length' | 'number' | 'font' | 'duration' | 'easing' | 'shadow' | 'z-index' | 'unknown';

export interface TypedToken<T extends TokenPrimitive = TokenPrimitive> {
  value: T;
  kind?: TokenKind;
  description?: string;
  deprecated?: boolean;
}

export type TokenInput = TokenPrimitive | TypedToken;
export type TokenMap = Readonly<Record<string, TokenInput>>;

export interface DesignSystemDefinition {
  name: string;
  version: string;
  extends?: DesignSystemDefinition;
  tokens: TokenMap;
  themes?: Readonly<Record<string, TokenMap>>;
  modes?: Readonly<Record<string, TokenMap>>;
  densities?: Readonly<Record<string, TokenMap>>;
  brands?: Readonly<Record<string, TokenMap>>;
  variants?: Readonly<Record<string, Readonly<Record<string, TokenMap>>>>;
}

export interface DesignSystemSelection {
  theme?: string;
  mode?: string;
  density?: string;
  brand?: string;
}

export interface TokenDiagnostic {
  code: 'VX_TOKEN_INVALID_NAME' | 'VX_TOKEN_INVALID_VALUE' | 'VX_TOKEN_REFERENCE_CYCLE' | 'VX_TOKEN_UNRESOLVED_REFERENCE' | 'VX_TOKEN_KIND_MISMATCH';
  token: string;
  message: string;
  suggestion: string;
}

export interface TokenChange {
  token: string;
  kind: 'added' | 'removed' | 'changed-kind' | 'changed-value';
  breaking: boolean;
  previous?: TokenInput;
  next?: TokenInput;
}

export interface DesignSystemPackage {
  name: string;
  version: string;
  manifest: string;
  cssText: string;
  tokens: Readonly<Record<string, TokenPrimitive>>;
}

export function defineDesignSystem(definition: DesignSystemDefinition): DesignSystemDefinition {
  if (!/^[a-z][a-z0-9-]*$/i.test(definition.name)) throw new TypeError('VX design-system name must be package-safe.');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(definition.version)) throw new TypeError('VX design-system version must use semantic versioning.');
  const diagnostics = validateTokens(resolveTokenInputs(definition));
  if (diagnostics.length) throw new TypeError(diagnostics.map((item) => `${item.token}: ${item.message}`).join('\n'));
  return Object.freeze({ ...definition, tokens: Object.freeze({ ...definition.tokens }) });
}

export function resolveDesignTokens(definition: DesignSystemDefinition, selection: DesignSystemSelection = {}): Readonly<Record<string, TokenPrimitive>> {
  const merged = resolveTokenInputs(definition, selection);
  const resolved: Record<string, TokenPrimitive> = {};
  const active = new Set<string>();
  const visit = (name: string): TokenPrimitive => {
    if (name in resolved) return resolved[name]!;
    if (active.has(name)) throw new TypeError(`VX token reference cycle contains '${name}'.`);
    const input = merged[name];
    if (input === undefined) throw new TypeError(`VX token '${name}' is not defined.`);
    active.add(name);
    const raw = tokenValue(input);
    const value = typeof raw === 'string'
      ? raw.replace(/\{([a-zA-Z0-9._-]+)\}/g, (_match, ref: string) => String(visit(ref)))
      : raw;
    active.delete(name);
    resolved[name] = value;
    return value;
  };
  for (const name of Object.keys(merged).sort()) visit(name);
  return Object.freeze(resolved);
}

export function installDesignSystem(target: HTMLElement, definition: DesignSystemDefinition, selection: DesignSystemSelection = {}): Cleanup {
  const previousAttributes = new Map<string, string | null>();
  const attributes: Record<string, string | undefined> = {
    'data-vx-design-system': definition.name,
    'data-vx-theme': selection.theme,
    'data-vx-mode': selection.mode,
    'data-vx-density': selection.density,
    'data-vx-brand': selection.brand
  };
  for (const [name, value] of Object.entries(attributes)) {
    previousAttributes.set(name, target.getAttribute(name));
    if (value) target.setAttribute(name, value); else target.removeAttribute(name);
  }
  const previous = new Map<string, string>();
  for (const [name, value] of Object.entries(resolveDesignTokens(definition, selection))) {
    const property = tokenProperty(name);
    previous.set(property, target.style.getPropertyValue(property));
    target.style.setProperty(property, String(value));
  }
  return () => {
    for (const [property, value] of previous) {
      if (value) target.style.setProperty(property, value);
      else target.style.removeProperty(property);
    }
    for (const [name, value] of previousAttributes) {
      if (value === null) target.removeAttribute(name);
      else target.setAttribute(name, value);
    }
  };
}

export function validateTokens(tokens: Readonly<Record<string, TokenInput>>): TokenDiagnostic[] {
  const diagnostics: TokenDiagnostic[] = [];
  for (const [name, input] of Object.entries(tokens)) {
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/i.test(name)) diagnostics.push({ code: 'VX_TOKEN_INVALID_NAME', token: name, message: 'Token names must be dot or dash separated identifiers.', suggestion: 'Rename the token, for example color.surface.base.' });
    const value = tokenValue(input);
    if (typeof value === 'number' && !Number.isFinite(value)) diagnostics.push({ code: 'VX_TOKEN_INVALID_VALUE', token: name, message: 'Numeric token values must be finite.', suggestion: 'Use a finite number or a CSS string.' });
    if (typeof value === 'string') {
      for (const reference of value.matchAll(/\{([a-zA-Z0-9._-]+)\}/g)) if (!(reference[1]! in tokens)) diagnostics.push({ code: 'VX_TOKEN_UNRESOLVED_REFERENCE', token: name, message: `Token references missing token '${reference[1]}'.`, suggestion: 'Declare the referenced token or remove the reference.' });
    }
  }
  detectCycles(tokens, diagnostics);
  return diagnostics;
}

export function compareDesignSystems(previous: DesignSystemDefinition, next: DesignSystemDefinition): TokenChange[] {
  const before = resolveTokenInputs(previous);
  const after = resolveTokenInputs(next);
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: TokenChange[] = [];
  for (const token of [...names].sort()) {
    const left = before[token]; const right = after[token];
    if (left === undefined) changes.push({ token, kind: 'added', breaking: false, next: right! });
    else if (right === undefined) changes.push({ token, kind: 'removed', breaking: true, previous: left });
    else if (tokenKind(left) !== tokenKind(right)) changes.push({ token, kind: 'changed-kind', breaking: true, previous: left, next: right });
    else if (tokenValue(left) !== tokenValue(right)) changes.push({ token, kind: 'changed-value', breaking: false, previous: left, next: right });
  }
  return changes;
}

export function packageDesignSystem(definition: DesignSystemDefinition, selection: DesignSystemSelection = {}): DesignSystemPackage {
  const tokens = resolveDesignTokens(definition, selection);
  const cssText = `:root{${Object.entries(tokens).map(([name, value]) => `${tokenProperty(name)}:${String(value)}`).join(';')}}`;
  const manifest = JSON.stringify({ name: definition.name, version: definition.version, selection, tokens }, null, 2);
  return Object.freeze({ name: definition.name, version: definition.version, manifest, cssText, tokens });
}

function resolveTokenInputs(definition: DesignSystemDefinition, selection: DesignSystemSelection = {}): Record<string, TokenInput> {
  return {
    ...(definition.extends ? resolveTokenInputs(definition.extends, selection) : {}),
    ...definition.tokens,
    ...(selection.theme ? definition.themes?.[selection.theme] ?? {} : {}),
    ...(selection.mode ? definition.modes?.[selection.mode] ?? {} : {}),
    ...(selection.density ? definition.densities?.[selection.density] ?? {} : {}),
    ...(selection.brand ? definition.brands?.[selection.brand] ?? {} : {})
  };
}
function tokenValue(input: TokenInput): TokenPrimitive { return typeof input === 'object' ? input.value : input; }
function tokenKind(input: TokenInput): TokenKind { return typeof input === 'object' ? input.kind ?? inferKind(input.value) : inferKind(input); }
function inferKind(value: TokenPrimitive): TokenKind {
  if (typeof value === 'number') return 'number';
  if (/^#|^rgb|^hsl|^oklch|^color\(/i.test(value)) return 'color';
  if (/^-?[\d.]+(?:px|rem|em|%|vh|vw|ch)$/.test(value)) return 'length';
  if (/^-?[\d.]+(?:ms|s)$/.test(value)) return 'duration';
  if (/^cubic-bezier|^linear\(/.test(value)) return 'easing';
  return 'unknown';
}
function tokenProperty(name: string): string { return `--vx-${name.replace(/\./g, '-')}`; }
function detectCycles(tokens: Readonly<Record<string, TokenInput>>, diagnostics: TokenDiagnostic[]): void {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) { diagnostics.push({ code: 'VX_TOKEN_REFERENCE_CYCLE', token: name, message: 'Token participates in a reference cycle.', suggestion: 'Replace one reference with a concrete value.' }); return; }
    visiting.add(name);
    const value = tokenValue(tokens[name]!);
    if (typeof value === 'string') for (const match of value.matchAll(/\{([a-zA-Z0-9._-]+)\}/g)) if (tokens[match[1]!]) visit(match[1]!);
    visiting.delete(name); visited.add(name);
  };
  for (const name of Object.keys(tokens)) visit(name);
}
