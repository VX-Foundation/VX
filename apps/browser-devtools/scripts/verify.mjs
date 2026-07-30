import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.devtools_page !== 'devtools.html') throw new Error('Invalid VX DevTools extension manifest.');
for (const file of ['devtools.html','devtools.js','panel.html','panel.js','panel.css']) readFileSync(resolve(root, file));
console.log('VX Browser DevTools extension verified.');
