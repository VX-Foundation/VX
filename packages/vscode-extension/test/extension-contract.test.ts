import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  activationEvents: string[];
  contributes: {
    commands: Array<{ command: string }>;
    languages: Array<{ id: string; extensions: string[] }>;
    grammars: Array<{ language: string; path: string }>;
    snippets: Array<{ language: string; path: string }>;
    debuggers: Array<{ type: string; languages: string[] }>;
  };
};
const extensionSource = readFileSync(resolve(root, 'src/extension.ts'), 'utf8');

describe('VS Code extension contract', () => {
  it('registers every command declared in the extension manifest', () => {
    for (const { command } of manifest.contributes.commands) {
      expect(extensionSource, command).toContain(`registerCommand('${command}'`);
    }
  });

  it('keeps language, grammar, snippets, and debugger contributions aligned', () => {
    expect(manifest.contributes.languages).toContainEqual(expect.objectContaining({ id: 'vx', extensions: ['.vx'] }));
    expect(manifest.contributes.grammars).toContainEqual(expect.objectContaining({ language: 'vx' }));
    expect(manifest.contributes.snippets.every((entry) => entry.language === 'vx')).toBe(true);
    expect(manifest.contributes.debuggers).toContainEqual(expect.objectContaining({ type: 'vx', languages: ['vx'] }));
    expect(manifest.activationEvents).toContain('onLanguage:vx');
    expect(manifest.activationEvents).toContain('onDebug:vx');
  });

  it('ships valid generated widget snippets and a staged language server', () => {
    const snippets = JSON.parse(readFileSync(resolve(root, 'snippets/widgets.generated.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(snippets)).toHaveLength(43);
    expect(snippets).toHaveProperty('VX Accordion widget');
    expect(readFileSync(resolve(root, 'server/server.js'), 'utf8')).toContain('createConnection');
  });
});
