import path from 'node:path';
import {
  GENERATED_SIZE_EXCEPTIONS,
  MAX_AUTHORED_LINES,
  SIZE_WARNING_LINES
} from './config.mjs';

export function inspectLineCount(rootDirectory, filePath, content) {
  const relativePath = normalize(path.relative(rootDirectory, filePath));
  const lineCount = content === '' ? 0 : content.split(/\r?\n/).length;
  const generatedException = GENERATED_SIZE_EXCEPTIONS.has(relativePath);

  if (lineCount > MAX_AUTHORED_LINES && !generatedException) {
    return {
      violation: `${relativePath} has ${lineCount} lines; the hard limit is ${MAX_AUTHORED_LINES}.`,
      warning: null
    };
  }

  if (lineCount > MAX_AUTHORED_LINES && generatedException) {
    return {
      violation: null,
      warning: `${relativePath} has ${lineCount} generated lines and is explicitly exempt from modular source limits.`
    };
  }

  if (lineCount >= SIZE_WARNING_LINES) {
    return {
      violation: null,
      warning: `${relativePath} has ${lineCount} lines and should be reviewed before it approaches the hard limit.`
    };
  }

  return { violation: null, warning: null };
}

function normalize(value) {
  return value.split(path.sep).join('/');
}
