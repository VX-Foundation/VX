import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectTextFiles, readTextFile } from './repository-policy/files.mjs';
import { inspectProjectLanguage } from './repository-policy/language-policy.mjs';
import { inspectLineCount } from './repository-policy/line-policy.mjs';
import { inspectSourcePackageBins } from './repository-policy/bin-policy.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const files = await collectTextFiles(rootDirectory);
const violations = [];
const warnings = [];

for (const filePath of files) {
  const content = await readTextFile(filePath);
  const sizeResult = inspectLineCount(rootDirectory, filePath, content);
  if (sizeResult.violation) violations.push(sizeResult.violation);
  if (sizeResult.warning) warnings.push(sizeResult.warning);
  violations.push(...inspectProjectLanguage(rootDirectory, filePath, content));
}

violations.push(...await inspectSourcePackageBins(rootDirectory));

for (const warning of warnings) console.warn(`Policy warning: ${warning}`);

if (violations.length > 0) {
  console.error(`Repository policy failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Repository policy passed for ${files.length} text files.`);
}
