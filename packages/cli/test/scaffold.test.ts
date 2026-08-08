import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeProject, scaffoldProject } from '../src/scaffold/project.js';
import { PROJECT_TEMPLATES, resolveTemplate } from '../src/scaffold/templates.js';

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

function workspace(): string {
  const path = mkdtempSync(join(tmpdir(), 'vx-scaffold-'));
  temporary.push(path);
  return path;
}

describe('VX project scaffolding', () => {
  for (const template of PROJECT_TEMPLATES) {
    it(`creates a complete ${template} project atomically`, () => {
      const cwd = workspace();
      const result = scaffoldProject({ cwd, name: `example-${template}`, template, frameworkVersion: '0.1.0' });
      expect(result.template).toBe(template);
      const manifest = JSON.parse(readFileSync(join(result.root, 'package.json'), 'utf8')) as Record<string, unknown>;
      expect(manifest['name']).toBe(`example-${template}`);
      expect(manifest['packageManager']).toBe('pnpm@11.19.0');
      expect((manifest['engines'] as Record<string, unknown>)['pnpm']).toBe('>=11.19.0 <12');
      expect(result.createdFiles).toEqual(expect.arrayContaining([...resolveTemplate(template).requiredFiles]));
    });
  }

  it('scaffolds projects with custom package managers (npm, yarn, bun)', () => {
    const cwd = workspace();
    const npmResult = scaffoldProject({ cwd, name: 'npm-app', template: 'basic', frameworkVersion: '0.1.0', packageManager: 'npm' });
    const npmManifest = JSON.parse(readFileSync(join(npmResult.root, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(npmManifest['packageManager']).toBe('npm@10.8.0');
    expect((npmManifest['engines'] as Record<string, unknown>)['npm']).toBe('>=10.0.0');
    expect((npmManifest['engines'] as Record<string, unknown>)['pnpm']).toBeUndefined();

    const yarnResult = scaffoldProject({ cwd, name: 'yarn-app', template: 'basic', frameworkVersion: '0.1.0', packageManager: 'yarn' });
    const yarnManifest = JSON.parse(readFileSync(join(yarnResult.root, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(yarnManifest['packageManager']).toBe('yarn@1.22.22');
    expect((yarnManifest['engines'] as Record<string, unknown>)['yarn']).toBe('>=1.22.0');

    const bunResult = scaffoldProject({ cwd, name: 'bun-app', template: 'basic', frameworkVersion: '0.1.0', packageManager: 'bun' });
    const bunManifest = JSON.parse(readFileSync(join(bunResult.root, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(bunManifest['packageManager']).toBe('bun@1.1.0');
    expect((bunManifest['engines'] as Record<string, unknown>)['bun']).toBe('>=1.1.0');
  });

  it('rejects traversal and absolute project paths', () => {
    const cwd = workspace();
    expect(() => scaffoldProject({ cwd, name: '../escape', template: 'basic', frameworkVersion: '0.1.0' })).toThrow(/inside|not allowed/);
    expect(() => scaffoldProject({ cwd, name: '/escape', template: 'basic', frameworkVersion: '0.1.0' })).toThrow(/relative/);
  });

  it('rejects non-portable Windows paths on every platform', () => {
    const cwd = workspace();
    for (const name of ['CON', 'nested/AUX.txt', 'trailing.', 'trailing ', 'bad:name', 'C:\\absolute']) {
      expect(() => scaffoldProject({ cwd, name, template: 'basic', frameworkVersion: '0.1.0' })).toThrow(/relative|portable|package name|invalid/i);
    }
  });

  it('does not leave a partial target when creation fails', () => {
    const cwd = workspace();
    expect(() => scaffoldProject({ cwd, name: 'broken', template: 'missing', frameworkVersion: '0.1.0' })).toThrow(/Unknown VX template/);
    expect(() => readFileSync(join(cwd, 'broken', 'package.json'), 'utf8')).toThrow();
  });

  it('rejects an ancestor file that blocks a template directory', () => {
    const root = workspace();
    writeFileSync(join(root, 'src'), 'not-a-directory');
    expect(() => initializeProject({ root, template: 'basic', frameworkVersion: '0.1.0' })).toThrow(/cross existing files/);
    expect(readFileSync(join(root, 'src'), 'utf8')).toBe('not-a-directory');
  });

  it('refuses to overwrite files during init', () => {
    const root = workspace();
    mkdirSync(join(root, 'src', 'pages'), { recursive: true });
    writeFileSync(join(root, 'src', 'pages', 'page.vx'), 'existing');
    expect(() => initializeProject({ root, template: 'basic', frameworkVersion: '0.1.0' })).toThrow(/overwrite/);
    expect(readFileSync(join(root, 'src', 'pages', 'page.vx'), 'utf8')).toBe('existing');
  });
});
