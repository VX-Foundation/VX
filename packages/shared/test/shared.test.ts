import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '@vx-foundation/types';

import {
  ensureLeadingDotSlash,
  findFilesByExtension,
  formatDiagnostic,
  hashContent,
  normalizeToPosixPath
} from '../src/index.js';

describe('@vx-foundation/shared', () => {
  it('normalizes paths to posix format', () => {
    expect(normalizeToPosixPath('packages\\shared\\src\\index.ts')).toBe('packages/shared/src/index.ts');
  });

  it('produces stable and predictable hashes', () => {
    expect(hashContent('vx')).toBe(hashContent('vx'));
    expect(hashContent('vx', 12)).toHaveLength(12);
  });

  it('ensures a relative prefix when needed', () => {
    expect(ensureLeadingDotSlash('src/index.ts')).toBe('./src/index.ts');
    expect(ensureLeadingDotSlash('../shared')).toBe('../shared');
  });

  it('formats diagnostics with location and context', () => {
    const diagnostic: Diagnostic = {
      code: 'VX1001',
      message: 'Unexpected token',
      severity: 'error',
      span: {
        filePath: 'src/pages/index.vx',
        start: { line: 4, column: 2, offset: 20 },
        end: { line: 4, column: 8, offset: 26 }
      },
      suggestion: 'Close the directive before ending the block.',
      notes: ['The parser should keep collecting errors after this point.']
    };

    expect(formatDiagnostic(diagnostic)).toContain('VX1001');
    expect(formatDiagnostic(diagnostic)).toContain('src/pages/index.vx:4:2-4:8');
  });

  it('walks files by extension without reimplementing the logic in every package', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vx-shared-'));

    try {
      await mkdir(path.join(tempRoot, 'nested'));
      await writeFile(path.join(tempRoot, 'root.ts'), 'export const root = true;\n', 'utf8');
      await writeFile(path.join(tempRoot, 'nested', 'child.ts'), 'export const child = true;\n', 'utf8');
      await writeFile(path.join(tempRoot, 'nested', 'child.md'), '# note\n', 'utf8');

      const files = await findFilesByExtension(tempRoot, 'ts');

      expect(files).toHaveLength(2);
      expect(files.every((filePath) => filePath.endsWith('.ts'))).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
