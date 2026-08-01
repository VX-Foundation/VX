import type { SourceSpan, ViewPatternNode } from '@vx-foundation/types';

const NAMED_PATTERN = /^([A-Za-z_][A-Za-z0-9_.]*)(?:\(([A-Za-z_][A-Za-z0-9_]*)\))?$/;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export interface ParsedViewPattern {
  pattern?: ViewPatternNode;
  error?: string;
}

/** Parses the closed, deliberately small pattern grammar used by `when/is`. */
export function parseViewPattern(text: string, span: SourceSpan): ParsedViewPattern {
  const source = text.trim();
  if (!source) return { error: 'A when branch requires a pattern after `is`.' };

  if (source === '_') {
    return {
      pattern: { kind: 'ViewPattern', text: source, category: 'wildcard', span }
    };
  }

  const literal = parseLiteral(source);
  if (literal.matched) {
    return {
      pattern: {
        kind: 'ViewPattern',
        text: source,
        category: 'literal',
        literal: literal.value,
        span
      }
    };
  }

  const named = NAMED_PATTERN.exec(source);
  if (!named) {
    return {
      error: "Patterns must be `_`, a literal, a named pattern such as `Success`, or a binding pattern such as `Success(value)`."
    };
  }

  const name = named[1]!;
  const binding = named[2];
  return {
    pattern: {
      kind: 'ViewPattern',
      text: source,
      category: 'named',
      name,
      ...(binding ? { binding } : {}),
      span
    }
  };
}

function parseLiteral(source: string):
  | { matched: true; value: string | number | boolean | null }
  | { matched: false } {
  if (source === 'true') return { matched: true, value: true };
  if (source === 'false') return { matched: true, value: false };
  if (source === 'null' || source === 'None') return { matched: true, value: null };
  if (NUMBER_PATTERN.test(source)) return { matched: true, value: Number(source) };

  if (source.length >= 2 && source[0] === '"' && source.at(-1) === '"') {
    try {
      const value = JSON.parse(source) as unknown;
      return typeof value === 'string' ? { matched: true, value } : { matched: false };
    } catch {
      return { matched: false };
    }
  }

  if (source.length >= 2 && source[0] === "'" && source.at(-1) === "'") {
    const body = source.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    return { matched: true, value: body };
  }

  return { matched: false };
}
