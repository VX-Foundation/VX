// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDomHarness } from '@vx-foundation/testing';

describe('official DOM testing', () => {
  it('queries by semantic role and accessible name', () => {
    document.body.innerHTML = '<main><label for="name">Name</label><input id="name"><button>Save</button></main>';
    const screen = createDomHarness(document);
    expect(screen.getByRole('button', { name: 'Save' }).tagName).toBe('BUTTON');
    expect(screen.getByLabelText('Name').id).toBe('name');
  });
});
