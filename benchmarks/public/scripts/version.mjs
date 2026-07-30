import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const name = process.argv[2];
if (!name) throw new Error('Package name is required.');
const path = resolve('node_modules', ...name.split('/'), 'package.json');
const manifest = JSON.parse(readFileSync(path, 'utf8'));
process.stdout.write(`${manifest.version}
`);
