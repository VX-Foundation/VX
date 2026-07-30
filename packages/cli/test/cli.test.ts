import { describe, expect, it } from 'vitest';
import { PROJECT_TEMPLATES } from '../src/scaffold/templates.js';

describe('VX CLI surface', () => {
  it('publishes every advertised project template', () => {
    expect(PROJECT_TEMPLATES).toEqual(['basic', 'starter', 'fullstack', 'library']);
  });
});
