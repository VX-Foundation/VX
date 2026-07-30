import { describe, expect, it, vi } from 'vitest';
import { normalizeCreateArguments, runCreateVX, type CreateVXRuntime } from '../src/index.js';

describe('create-vx', () => {
  it('defaults to the create command', () => {
    expect(normalizeCreateArguments(['my-app'])).toEqual(['create', 'my-app']);
    expect(normalizeCreateArguments([])).toEqual(['create']);
  });

  it('preserves explicit commands', () => {
    expect(normalizeCreateArguments(['new', 'my-app'])).toEqual(['new', 'my-app']);
    expect(normalizeCreateArguments(['init', '--template', 'starter'])).toEqual(['init', '--template', 'starter']);
  });

  it('forwards the resolved CLI exit code', () => {
    const spawn = vi.fn(() => ({ status: 7, signal: null, output: [], pid: 1, stdout: null, stderr: null }));
    const runtime: CreateVXRuntime = { resolveCli: () => '/vx/cli.js', spawn, report: vi.fn() };
    expect(runCreateVX(['example'], runtime)).toBe(7);
    expect(spawn).toHaveBeenCalledWith(process.execPath, ['/vx/cli.js', 'create', 'example']);
  });

  it('fails clearly when the CLI cannot be resolved', () => {
    const report = vi.fn();
    const runtime: CreateVXRuntime = {
      resolveCli: () => { throw new Error('missing package'); },
      spawn: vi.fn(),
      report
    };
    expect(runCreateVX(['example'], runtime)).toBe(1);
    expect(report).toHaveBeenCalledWith(expect.stringContaining('missing package'));
  });
});
