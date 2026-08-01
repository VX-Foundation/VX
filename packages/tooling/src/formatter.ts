import { parse } from '@vx-foundation/language';
import type { Diagnostic } from '@vx-foundation/types';

export interface FormatOptions {
  indent?: number;
  finalNewline?: boolean;
}

export interface FormatResult {
  code: string;
  changed: boolean;
  diagnostics: Diagnostic[];
}

/**
 * Produces the canonical textual representation of a VX module. The formatter
 * validates through the real parser, preserves comments and expression bodies,
 * normalizes line endings, indentation, blank lines, and trailing whitespace,
 * and is intentionally idempotent.
 */
export function formatVX(source: string, filePath = '<memory>', options: FormatOptions = {}): FormatResult {
  const parsed = parse(source, filePath);
  if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { code: source, changed: false, diagnostics: parsed.diagnostics };
  }

  const indentWidth = options.indent ?? 2;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const formatted: string[] = [];
  let depth = 0;
  let previousBlank = false;
  let blockComment = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (!previousBlank && formatted.length > 0) formatted.push('');
      previousBlank = true;
      continue;
    }

    previousBlank = false;
    const startsInBlockComment = blockComment;
    const leadingClosures = !startsInBlockComment && startsWithClosingBrace(trimmed) ? countLeadingClosingBraces(trimmed) : 0;
    if (isBlockClose(trimmed)) depth = 0;
    else if (leadingClosures > 0) depth = Math.max(0, depth - leadingClosures);

    const normalizationState: LexicalState = { blockComment: startsInBlockComment };
    const normalized = normalizeLine(trimmed, normalizationState);
    const deltaState: LexicalState = { blockComment: startsInBlockComment };
    const delta = braceDelta(trimmed, deltaState);
    blockComment = normalizationState.blockComment;
    formatted.push(`${' '.repeat(depth * indentWidth)}${normalized}`);

    if (isBlockOpen(trimmed)) depth = 1;
    else if (isBlockClose(trimmed)) depth = 0;
    else depth = Math.max(0, depth + delta + leadingClosures);
  }

  while (formatted.at(-1) === '') formatted.pop();
  const finalNewline = options.finalNewline ?? true;
  const code = `${formatted.join('\n')}${finalNewline ? '\n' : ''}`;
  const formattedParse = parse(code, filePath);
  const formatterError = formattedParse.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (formatterError) {
    return {
      code: source,
      changed: false,
      diagnostics: [
        ...parsed.diagnostics,
        {
          code: 'VX8001',
          message: `Formatter output failed parser validation: ${formatterError.message}`,
          severity: 'error',
          span: formatterError.span,
          suggestion: 'Report this formatter case with the original VX source.'
        }
      ]
    };
  }
  return { code, changed: code !== source, diagnostics: parsed.diagnostics };
}

export function printCanonicalVX(source: string, filePath = '<memory>', options: FormatOptions = {}): string {
  const result = formatVX(source, filePath, options);
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const first = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    throw new Error(first ? `[${first.code}] ${first.message}` : 'VX source cannot be formatted.');
  }
  return result.code;
}

function isBlockOpen(line: string): boolean {
  return line === '#script' || line === '#view';
}

function isBlockClose(line: string): boolean {
  return line === '#end script' || line === '#end view';
}

function startsWithClosingBrace(line: string): boolean {
  return line.startsWith('}');
}

function countLeadingClosingBraces(line: string): number {
  let count = 0;
  for (const character of line) {
    if (character !== '}') break;
    count += 1;
  }
  return count;
}

interface LexicalState {
  blockComment: boolean;
}

function braceDelta(line: string, state: LexicalState): number {
  let delta = 0;
  let quote: '"' | "'" | '`' | '/' | undefined;
  let regexClass = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    const next = line[index + 1];
    if (state.blockComment) {
      if (character === '*' && next === '/') { state.blockComment = false; index += 1; }
      continue;
    }
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (character === '\\') { escaped = true; continue; }
      if (quote === '/') {
        if (character === '[') regexClass = true;
        else if (character === ']') regexClass = false;
        else if (character === '/' && !regexClass) quote = undefined;
      } else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '/' && next === '/') break;
    if (character === '/' && next === '*') { state.blockComment = true; index += 1; continue; }
    if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
    if (character === '/' && isRegexStart(line, index)) { quote = '/'; regexClass = false; continue; }
    if (character === '{') delta += 1;
    else if (character === '}') delta -= 1;
  }
  return delta;
}

function normalizeLine(line: string, state: LexicalState): string {
  if (!state.blockComment && line.startsWith('//')) return line;
  if (!state.blockComment && (isBlockOpen(line) || isBlockClose(line))) return line;
  return mapOutsideLiterals(line, normalizeCodeSegment, state);
}

function normalizeCodeSegment(segment: string): string {
  const operators = [
    ['===', '\u0000VX_STRICT_EQUAL\u0000', ' === '],
    ['!==', '\u0000VX_STRICT_NOT_EQUAL\u0000', ' !== '],
    ['=>', '\u0000VX_ARROW\u0000', ' => '],
    ['==', '\u0000VX_EQUAL\u0000', ' == '],
    ['!=', '\u0000VX_NOT_EQUAL\u0000', ' != '],
    ['<=', '\u0000VX_LESS_EQUAL\u0000', ' <= '],
    ['>=', '\u0000VX_GREATER_EQUAL\u0000', ' >= '],
    ['&&', '\u0000VX_AND\u0000', ' && '],
    ['||', '\u0000VX_OR\u0000', ' || '],
    ['++', '\u0000VX_INCREMENT\u0000', '++'],
    ['--', '\u0000VX_DECREMENT\u0000', '--']
  ] as const;
  let output = segment;
  for (const [operator, token] of operators) output = output.replaceAll(operator, token);
  for (const [, token] of operators) output = output.replace(new RegExp(`\\s*${escapeRegExp(token)}\\s*`, 'g'), token);
  output = output
    .replace(/[ \t]+$/g, '')
    .replace(/\s*:\s*/g, ': ')
    .replace(/,\s*/g, ', ')
    .replace(/\s*=\s*/g, ' = ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s*\*\s*/g, ' * ')
    .replace(/\b(import|export)\s+\{/g, '$1 {')
    .replace(/\}\s+from\s+/g, '} from ')
    .replace(/(?<=[A-Za-z0-9_)])\s*\{/g, ' {')
    .replace(/\s+\{/g, ' {')
    .replace(/\{\s+$/g, '{');
  for (const [, token, canonical] of operators) output = output.replaceAll(token, canonical);
  return output;
}


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapOutsideLiterals(
  line: string,
  transform: (segment: string) => string,
  state: LexicalState
): string {
  let output = '';
  let plain = '';
  let quote: '"' | "'" | '`' | '/' | undefined;
  let regexClass = false;
  let escaped = false;
  const flush = (): void => { output += transform(plain); plain = ''; };

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    const next = line[index + 1];
    if (state.blockComment) {
      output += character;
      if (character === '*' && next === '/') {
        output += next;
        state.blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      output += character;
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (quote === '/') {
        if (character === '[') regexClass = true;
        else if (character === ']') regexClass = false;
        else if (character === '/' && !regexClass) quote = undefined;
      } else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '/' && next === '/') {
      flush();
      if (output.length > 0 && !/\s$/.test(output)) output += ' ';
      output += line.slice(index);
      return output;
    }
    if (character === '/' && next === '*') {
      flush();
      if (output.length > 0 && !/\s$/.test(output)) output += ' ';
      output += '/*';
      state.blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      flush();
      quote = character;
      output += character;
      continue;
    }
    if (character === '/' && isRegexStart(line, index)) {
      flush();
      quote = '/';
      regexClass = false;
      output += character;
      continue;
    }
    plain += character;
  }
  flush();
  return output;
}

function isRegexStart(line: string, index: number): boolean {
  const prefix = line.slice(0, index).trimEnd();
  if (!prefix) return true;
  if (/\b(return|throw|case|await|yield)$/.test(prefix)) return true;
  return /[([{,:;=!?&|+*%<>-]$/.test(prefix);
}
