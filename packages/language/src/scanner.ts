import type { SourcePosition, SourceSpan } from '@vx/types';

/**
 * A position-tracking cursor over a slice of `.vx` source text.
 *
 * Every sub-parser (state block, view block) gets its own `Scanner` instance,
 * seeded with the `SourcePosition` where its slice begins in the original
 * file. This keeps every span produced by the parser expressed in the
 * coordinates of the original file, never in coordinates relative to the
 * extracted block text, which is what lets diagnostics point at real
 * `.vx` source (see docs/framework/architecture.md).
 */
export class Scanner {
  private readonly source: string;
  private readonly filePath: string;
  private readonly baseOffset: number;

  public offset = 0;
  public line: number;
  public column: number;
  private lineStartOffset = 0;

  constructor(
    source: string,
    filePath: string,
    base: SourcePosition = { line: 1, column: 1, offset: 0 }
  ) {
    this.source = source;
    this.filePath = filePath;
    this.baseOffset = base.offset;
    this.line = base.line;
    this.column = base.column;
  }

  get isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  position(): SourcePosition {
    return { line: this.line, column: this.column, offset: this.baseOffset + this.offset };
  }

  span(start: SourcePosition, end: SourcePosition = this.position()): SourceSpan {
    return { filePath: this.filePath, start, end };
  }

  peek(ahead = 0): string {
    return this.source[this.offset + ahead] ?? '';
  }

  isAtLineStart(): boolean {
    return /^[ \t]*$/.test(this.source.slice(this.lineStartOffset, this.offset));
  }

  lookingAt(literal: string): boolean {
    return this.source.startsWith(literal, this.offset);
  }

  advance(): string {
    const char = this.source[this.offset] ?? '';
    this.offset += 1;

    if (char === '\n') {
      this.line += 1;
      this.column = 1;
      this.lineStartOffset = this.offset;
    } else {
      this.column += 1;
    }

    return char;
  }

  match(literal: string): boolean {
    if (!this.lookingAt(literal)) {
      return false;
    }

    for (let i = 0; i < literal.length; i += 1) {
      this.advance();
    }

    return true;
  }

  matchKeyword(word: string): boolean {
    const pattern = new RegExp(`^${word}\\b`);

    if (!pattern.test(this.source.slice(this.offset))) {
      return false;
    }

    for (let i = 0; i < word.length; i += 1) {
      this.advance();
    }

    return true;
  }

  peekDirectiveKeyword(): string | null {
    const match = /^@([A-Za-z][A-Za-z0-9]*)\b/.exec(this.source.slice(this.offset));
    return match?.[1] ?? null;
  }

  matchDirectiveKeyword(name: string): boolean {
    const pattern = new RegExp(`^@${name}\\b`);
    const slice = this.source.slice(this.offset);
    const match = pattern.exec(slice);

    if (!match) {
      return false;
    }

    for (let i = 0; i < match[0].length; i += 1) {
      this.advance();
    }

    return true;
  }

  matchDirectiveEnd(name: string): boolean {
    const pattern = new RegExp(`^@end[ \\t]+${name}\\b`);
    const slice = this.source.slice(this.offset);
    const match = pattern.exec(slice);

    if (!match) {
      return false;
    }

    for (let i = 0; i < match[0].length; i += 1) {
      this.advance();
    }

    return true;
  }

  peekEventBindingShape(): string | null {
    const match = /^@([A-Za-z][A-Za-z0-9]*)=/.exec(this.source.slice(this.offset));
    return match?.[1] ?? null;
  }

  skipInlineWhitespace(): void {
    while (!this.isAtEnd && (this.peek() === ' ' || this.peek() === '\t')) {
      this.advance();
    }
  }

  skipWhitespace(): void {
    while (!this.isAtEnd && /\s/.test(this.peek())) {
      this.advance();
    }
  }

  skipWhitespaceAndComments(): void {
    for (;;) {
      while (!this.isAtEnd && /\s/.test(this.peek())) {
        this.advance();
      }

      if (this.lookingAt('//')) {
        while (!this.isAtEnd && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      break;
    }
  }

  readWhile(predicate: (char: string) => boolean): string {
    let result = '';

    while (!this.isAtEnd && predicate(this.peek())) {
      result += this.advance();
    }

    return result;
  }

  advanceUntil(char: string): void {
    while (!this.isAtEnd && this.peek() !== char) {
      this.advance();
    }
  }

  readUntil(char: string): string {
    let result = '';
    while (!this.isAtEnd && this.peek() !== char) {
      result += this.advance();
    }
    return result;
  }

  readIdentifier(): string {
    if (!/[A-Za-z_]/.test(this.peek())) {
      return '';
    }

    return this.readWhile((char) => /[A-Za-z0-9_.]/.test(char));
  }
}
