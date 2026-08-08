import { readFileSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';


function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && extname(entry.name) === '.json') files.push(path);
  }
}

class JsonIntegrityParser {
  constructor(source, file) {
    this.source = source;
    this.file = file;
    this.offset = 0;
  }

  parse() {
    this.skipWhitespace();
    this.parseValue('$');
    this.skipWhitespace();
    if (!this.end) this.fail('Unexpected trailing content');
  }

  parseValue(path) {
    this.skipWhitespace();
    const character = this.peek();
    if (character === '{') return this.parseObject(path);
    if (character === '[') return this.parseArray(path);
    if (character === '"') return this.parseString();
    if (character === '-' || this.isDigit(character)) return this.parseNumber();
    if (this.consumeKeyword('true') || this.consumeKeyword('false') || this.consumeKeyword('null')) return;
    this.fail('Expected a JSON value');
  }

  parseObject(path) {
    this.expect('{');
    const keys = new Map();
    this.skipWhitespace();
    if (this.match('}')) return;

    for (;;) {
      this.skipWhitespace();
      const keyOffset = this.offset;
      if (this.peek() !== '"') this.fail('Expected a quoted object key');
      const key = this.parseString();
      const previousOffset = keys.get(key);
      if (previousOffset !== undefined) {
        const first = this.location(previousOffset);
        const duplicate = this.location(keyOffset);
        throw new Error(`${this.file}:${duplicate.line}:${duplicate.column} duplicate key '${key}' at ${path}; first declared at ${first.line}:${first.column}`);
      }
      keys.set(key, keyOffset);
      this.skipWhitespace();
      this.expect(':');
      this.parseValue(`${path}.${escapePathSegment(key)}`);
      this.skipWhitespace();
      if (this.match('}')) return;
      this.expect(',');
    }
  }

  parseArray(path) {
    this.expect('[');
    this.skipWhitespace();
    if (this.match(']')) return;
    let index = 0;
    for (;;) {
      this.parseValue(`${path}[${index}]`);
      index += 1;
      this.skipWhitespace();
      if (this.match(']')) return;
      this.expect(',');
    }
  }

  parseString() {
    this.expect('"');
    let value = '';
    while (!this.end) {
      const character = this.next();
      if (character === '"') return value;
      if (character === '\\') {
        if (this.end) this.fail('Unterminated escape sequence');
        const escape = this.next();
        const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[escape];
        if (simple !== undefined) { value += simple; continue; }
        if (escape !== 'u') this.fail(`Invalid escape sequence \\${escape}`);
        const hex = this.source.slice(this.offset, this.offset + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Invalid Unicode escape sequence');
        value += String.fromCharCode(Number.parseInt(hex, 16));
        this.offset += 4;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) this.fail('Control characters are not allowed in JSON strings');
      value += character;
    }
    this.fail('Unterminated JSON string');
  }

  parseNumber() {
    const rest = this.source.slice(this.offset);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (!match) this.fail('Invalid JSON number');
    this.offset += match[0].length;
  }

  consumeKeyword(keyword) {
    if (!this.source.startsWith(keyword, this.offset)) return false;
    this.offset += keyword.length;
    return true;
  }

  expect(character) {
    if (!this.match(character)) this.fail(`Expected '${character}'`);
  }

  match(character) {
    if (this.peek() !== character) return false;
    this.offset += 1;
    return true;
  }

  skipWhitespace() {
    while (/\s/.test(this.peek())) this.offset += 1;
  }

  location(offset) {
    const before = this.source.slice(0, offset);
    const lines = before.split('\n');
    return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
  }

  fail(message) {
    const { line, column } = this.location(this.offset);
    throw new Error(`${this.file}:${line}:${column} ${message}`);
  }

  peek() { return this.source[this.offset] ?? ''; }
  next() { return this.source[this.offset++] ?? ''; }
  isDigit(value) { return value >= '0' && value <= '9'; }
  get end() { return this.offset >= this.source.length; }
}

function escapePathSegment(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value);
}

const root = resolve(import.meta.dirname, '..');
const skippedDirectories = new Set([
  '.git', '.turbo', '.vx', 'build', 'coverage', 'dist', 'node_modules',
  'playwright-report', 'release-artifacts', 'test-results'
]);
const files = [];
collect(root);

const violations = [];
for (const file of files.sort()) {
  const source = readFileSync(file, 'utf8');
  try {
    new JsonIntegrityParser(source, relative(root, file).replaceAll('\\', '/')).parse();
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
  }
}

if (violations.length > 0) {
  console.error(`JSON integrity verification failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`JSON integrity verified: ${files.length} files, no duplicate keys or syntax errors.`);
