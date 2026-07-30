import { type Scanner } from './scanner.js';

export function recoverToNextLine(scanner: Scanner): void {
  while (!scanner.isAtEnd && scanner.peek() !== '\n') scanner.advance();
}
