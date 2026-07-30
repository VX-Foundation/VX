import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface WalkFilesOptions {
  extensions?: string[];
  ignore?: string[];
}

function normalizeExtension(extension: string): string {
  return extension.startsWith('.') ? extension : `.${extension}`;
}

export function hasFileExtension(filePath: string, extension: string): boolean {
  return path.extname(filePath) === normalizeExtension(extension);
}

export async function walkFiles(root: string, options: WalkFilesOptions = {}): Promise<string[]> {
  const collected: string[] = [];
  const ignoredEntries = new Set(options.ignore ?? []);
  const normalizedExtensions = options.extensions?.map(normalizeExtension);

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (ignoredEntries.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (
        normalizedExtensions &&
        normalizedExtensions.length > 0 &&
        !normalizedExtensions.includes(path.extname(entry.name))
      ) {
        continue;
      }

      collected.push(fullPath);
    }
  }

  await visit(root);

  return collected;
}

export async function findFilesByExtension(
  root: string,
  extension: string,
  ignore: string[] = []
): Promise<string[]> {
  return walkFiles(root, {
    extensions: [extension],
    ignore
  });
}
