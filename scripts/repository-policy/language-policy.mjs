import { createHash } from 'node:crypto';
import path from 'node:path';
import { DISALLOWED_LANGUAGE_TOKEN_HASHES } from './config.mjs';

const WORD_PATTERN = /\p{L}+/gu;

export function inspectProjectLanguage(rootDirectory, filePath, content) {
  const relativePath = normalize(path.relative(rootDirectory, filePath));
  const violations = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const words = lines[index].match(WORD_PATTERN) ?? [];
    const disallowed = words.find((word) => DISALLOWED_LANGUAGE_TOKEN_HASHES.has(hash(word)));
    if (!disallowed) continue;
    violations.push(`${relativePath}:${index + 1} contains a non-English project-language token: ${JSON.stringify(disallowed)}.`);
  }

  return violations;
}

function hash(value) {
  return createHash('sha256').update(value.toLocaleLowerCase('und')).digest('hex');
}

function normalize(value) {
  return value.split(path.sep).join('/');
}
