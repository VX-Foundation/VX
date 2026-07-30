import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SKIPPED_DIRECTORIES, TEXT_FILE_EXTENSIONS } from './config.mjs';

export async function collectTextFiles(rootDirectory) {
  const files = [];
  await walk(rootDirectory, files);
  return files.sort();
}

export async function readTextFile(filePath) {
  return readFile(filePath, 'utf8');
}

async function walk(directory, output) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath, output);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name === 'LICENSE' || TEXT_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(absolutePath);
    }
  }
}
