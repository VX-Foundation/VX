import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Diagnostic, SourceSpan } from '@vx/types';
import type { WorkspaceIndexOptions, WorkspaceIndexResult } from './types.js';
import type { VXLanguageService } from './language-service.js';

const DEFAULT_EXCLUDES = ['node_modules', '.git', '.vx', 'dist', 'build', 'coverage'];

export function indexVXWorkspace(service: VXLanguageService, root: string, options: WorkspaceIndexOptions = {}): WorkspaceIndexResult {
  const workspace = resolve(root);
  const maxFiles = options.maxFiles ?? 20_000;
  const maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
  const excludes = new Set([...(options.exclude ?? []), ...DEFAULT_EXCLUDES]);
  const diagnostics: Diagnostic[] = [];
  let indexedFiles = 0; let skippedFiles = 0; let truncated = false;
  const visit = (directory: string): void => {
    if (options.signal?.aborted || truncated) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (options.signal?.aborted || truncated) return;
      if (entry.name.startsWith('.') && entry.name !== '.vx') { if (entry.isDirectory()) continue; }
      if (entry.isDirectory() && excludes.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { visit(path); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.vx')) continue;
      if (indexedFiles >= maxFiles) { truncated = true; break; }
      const size = statSync(path).size;
      if (size > maxFileBytes) { skippedFiles += 1; diagnostics.push(workspaceDiagnostic(path, 'VX_LSP_FILE_TOO_LARGE', `Skipped '${relative(workspace, path)}' because it exceeds ${maxFileBytes} bytes.`)); continue; }
      service.update(pathToUri(path), readFileSync(path, 'utf8'), Math.trunc(statSync(path).mtimeMs));
      indexedFiles += 1;
    }
  };
  if (existsSync(workspace)) visit(workspace);
  if (truncated) diagnostics.push(workspaceDiagnostic(workspace, 'VX_LSP_WORKSPACE_TRUNCATED', `Workspace indexing stopped after ${maxFiles} VX files.`));
  return { indexedFiles, skippedFiles, truncated, diagnostics };
}

export function pathToUri(path: string): string { return new URL(`file://${resolve(path).replaceAll('\\', '/')}`).toString(); }
function workspaceDiagnostic(path: string, code: string, message: string): Diagnostic {
  const span: SourceSpan = { filePath: path, start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
  return { code, severity: 'warning', message, span };
}

/**
 * Cooperative workspace indexing for language-server processes. It yields to
 * the event loop between bounded batches so cancellation and editor traffic
 * are not starved by large repositories.
 */
export async function indexVXWorkspaceAsync(service: VXLanguageService, root: string, options: WorkspaceIndexOptions = {}): Promise<WorkspaceIndexResult> {
  const workspace = resolve(root);
  const maxFiles = options.maxFiles ?? 20_000;
  const maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
  const excludes = new Set([...(options.exclude ?? []), ...DEFAULT_EXCLUDES]);
  const diagnostics: Diagnostic[] = [];
  const directories = [workspace];
  let indexedFiles = 0;
  let skippedFiles = 0;
  let truncated = false;
  let operations = 0;
  while (directories.length > 0 && !truncated) {
    throwIfAborted(options.signal);
    const directory = directories.pop()!;
    let entries: Dirent<string>[];
    try { entries = readdirSync(directory, { withFileTypes: true }); }
    catch (cause) {
      diagnostics.push(workspaceDiagnostic(directory, 'VX_LSP_DIRECTORY_READ', `Unable to read '${relative(workspace, directory) || '.'}': ${cause instanceof Error ? cause.message : String(cause)}.`));
      continue;
    }
    for (const entry of entries) {
      throwIfAborted(options.signal);
      if (entry.isDirectory() && (excludes.has(entry.name) || (entry.name.startsWith('.') && entry.name !== '.vx'))) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(path);
      else if (entry.isFile() && entry.name.endsWith('.vx')) {
        if (indexedFiles >= maxFiles) { truncated = true; break; }
        const stats = statSync(path);
        if (stats.size > maxFileBytes) {
          skippedFiles += 1;
          diagnostics.push(workspaceDiagnostic(path, 'VX_LSP_FILE_TOO_LARGE', `Skipped '${relative(workspace, path)}' because it exceeds ${maxFileBytes} bytes.`));
        } else {
          service.update(pathToUri(path), readFileSync(path, 'utf8'), Math.trunc(stats.mtimeMs), options.signal);
          indexedFiles += 1;
        }
      }
      operations += 1;
      if (operations % 128 === 0) await yieldToEventLoop();
    }
  }
  if (truncated) diagnostics.push(workspaceDiagnostic(workspace, 'VX_LSP_WORKSPACE_TRUNCATED', `Workspace indexing stopped after ${maxFiles} VX files.`));
  return { indexedFiles, skippedFiles, truncated, diagnostics };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error('VX workspace indexing was cancelled.');
}
function yieldToEventLoop(): Promise<void> { return new Promise((resolveYield) => setImmediate(resolveYield)); }
