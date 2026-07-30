import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeProject, scaffoldProject } from '../../packages/cli/dist/scaffold/project.js';
import { PROJECT_TEMPLATES, resolveTemplate } from '../../packages/cli/dist/scaffold/templates.js';
import { compileComponentProject } from '../../packages/compiler/dist/project.js';
import { buildApplicationGraph } from '../../packages/router/dist/index.js';
import { packageLibrary } from '../../packages/core/dist/package.js';
import { normalizeLibraryEntries, normalizeLibraryFileName } from '../../packages/bundler/dist/build/library.js';
import { checkCommand, lintCommand } from '../../packages/cli/dist/commands/workspace.js';
import { testComponentCommand } from '../../packages/cli/dist/commands/tooling.js';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = mkdtempSync(join(tmpdir(), 'vx-project-creation-'));

try {
  const summary = [];
  for (const template of PROJECT_TEMPLATES) {
    const result = scaffoldProject({
      cwd: temporary,
      name: `vx-${template}-verification`,
      template,
      frameworkVersion: '0.1.0'
    });
    const descriptor = resolveTemplate(template);
    assert.deepEqual(result.createdFiles.filter((file) => descriptor.requiredFiles.includes(file)).sort(), [...descriptor.requiredFiles].sort());
    validateManifest(result.root, template);
    const componentCount = compileVXFiles(result.root);
    checkCommand(join(result.root, 'src'));
    lintCommand(join(result.root, 'src'));
    testComponentCommand(template === 'library'
      ? join(result.root, 'src/components/Card.vx')
      : join(result.root, 'src/pages/page.vx'));

    if (template === 'library') {
      const staged = packageLibrary(result.root, { outDir: '.vx-package-verification', frameworkVersion: '0.1.0' });
      assertNoDiagnostics(staged.diagnostics, 'library package staging');
      assert.ok(staged.manifest, 'Library package staging did not emit a manifest.');
      assert.deepEqual(Object.keys(staged.manifest.exports).sort(), ['./card', './labels']);
      const entries = normalizeLibraryEntries(result.root, ['src/components/Card.vx', 'src/modules/labels.vx']);
      assert.deepEqual(Object.keys(entries), ['Card', 'labels']);
      const fileName = normalizeLibraryFileName(entries);
      assert.equal(typeof fileName, 'function');
      assert.equal(fileName('es', 'Card'), 'Card.js');
      assert.equal(fileName('cjs', 'labels'), 'labels.cjs');
      summary.push({ template, files: result.createdFiles.length, components: componentCount, exports: Object.keys(staged.manifest.exports).length });
      continue;
    }

    const graph = buildApplicationGraph({ dir: join(result.root, 'src/pages'), rootDir: result.root });
    assertNoDiagnostics(graph.diagnostics, `${template} route graph`);
    assert.ok(graph.routes.length > 0, `${template} must generate at least one route.`);
    summary.push({ template, files: result.createdFiles.length, components: componentCount, routes: graph.routes.length });
  }

  verifyScaffoldSafety();
  verifyPublishedCliContainsTemplates();
  console.log(`VX project creation verification passed (${summary.map((item) => `${item.template}:${item.files} files`).join(', ')}).`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function verifyScaffoldSafety() {
  assert.throws(() => scaffoldProject({ cwd: temporary, name: '../escape', template: 'basic', frameworkVersion: '0.1.0' }), /inside|not allowed/);
  for (const name of ['CON', 'nested/AUX.txt', 'trailing.', 'bad:name', 'C:\\absolute']) {
    assert.throws(() => scaffoldProject({ cwd: temporary, name, template: 'basic', frameworkVersion: '0.1.0' }), /relative|portable/);
  }

  const initializedRoot = join(temporary, 'init-existing');
  mkdirSync(initializedRoot, { recursive: true });
  writeFileSync(join(initializedRoot, 'existing.txt'), 'preserve-me');
  const initialized = initializeProject({ root: initializedRoot, template: 'starter', frameworkVersion: '0.1.0' });
  assert.ok(initialized.createdFiles.includes('src/pages/page.vx'));
  assert.equal(readFileSync(join(initializedRoot, 'existing.txt'), 'utf8'), 'preserve-me');

  const conflictRoot = join(temporary, 'init-conflict');
  mkdirSync(conflictRoot, { recursive: true });
  writeFileSync(join(conflictRoot, 'src'), 'not-a-directory');
  assert.throws(() => initializeProject({ root: conflictRoot, template: 'basic', frameworkVersion: '0.1.0' }), /cross existing files/);
  assert.equal(readFileSync(join(conflictRoot, 'src'), 'utf8'), 'not-a-directory');
}

function validateManifest(root, template) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.packageManager, 'pnpm@11.17.0');
  assert.equal(manifest.engines?.node, '>=22.11.0 <23 || >=24.11.0 <25');
  assert.equal(manifest.engines?.pnpm, '>=11.17.0 <12');
  const mandatory = template === 'library'
    ? ['build', 'check', 'lint', 'test', 'doctor', 'package', 'verify']
    : ['dev', 'build', 'preview', 'check', 'lint', 'test', 'doctor', 'verify'];
  for (const name of mandatory) assert.equal(typeof manifest.scripts?.[name], 'string', `${template} is missing script '${name}'.`);
  for (const dependencies of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (name.startsWith('@vx/')) assert.equal(version, '^0.1.0', `${template} did not pin ${name} to the generated framework line.`);
    }
  }
}

function compileVXFiles(root) {
  const files = walk(root).filter((file) => file.endsWith('.vx'));
  assert.ok(files.length > 0, `Generated project '${root}' has no VX sources.`);
  for (const file of files) {
    const result = compileComponentProject(file, { rootDir: root, frameworkVersion: '0.1.0', failFast: true });
    assertNoDiagnostics(result.diagnostics, relative(root, file));
    assert.ok(result.artifacts.size > 0, `Compiler emitted no artifacts for '${relative(root, file)}'.`);
  }
  return files.length;
}

function verifyPublishedCliContainsTemplates() {
  const packed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], {
    cwd: join(workspace, 'packages/cli'),
    encoding: 'utf8',
    shell: true
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const output = JSON.parse(packed.stdout);
  const files = new Set((output[0]?.files ?? []).map((item) => item.path));
  for (const template of PROJECT_TEMPLATES) {
    assert.ok(files.has(`templates/${template}/package.json`), `Published @vx/cli artifact omits template '${template}'.`);
  }
  assert.ok(files.has('dist/cli.js'), 'Published @vx/cli artifact omits its compiled CLI implementation.');
  assert.ok(files.has('bin/vx.js'), 'Published @vx/cli artifact omits its stable binary launcher.');
}

function walk(root) {
  const output = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.vx', '.git'].includes(entry.name)) continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && statSync(absolute).isFile()) output.push(absolute);
    }
  }
  return output.sort();
}

function assertNoDiagnostics(diagnostics, context) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  assert.equal(errors.length, 0, `${context} failed:\n${errors.map((item) => `[${item.code}] ${item.message}`).join('\n')}`);
}
