import type { SourceSpan } from '@vx/types';

export type BlockKind = 'script' | 'view';

export type Token =
  | { type: 'BlockOpen'; kind: BlockKind; span: SourceSpan }
  | { type: 'BlockClose'; kind: BlockKind; span: SourceSpan }
  | { type: 'ModelDeclaration'; name: string; content: string; span: SourceSpan }
  | { type: 'EOF'; span: SourceSpan };

export const BLOCK_KINDS: readonly BlockKind[] = ['script', 'view'];

export function isBlockKind(word: string): word is BlockKind {
  return (BLOCK_KINDS as readonly string[]).includes(word);
}
