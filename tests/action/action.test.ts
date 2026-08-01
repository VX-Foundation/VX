import { describe, expect, it } from 'vitest';
import { invokeAction } from '@vx-foundation/testing';

describe('official action testing', () => {
  it('captures values and typed failures', async () => {
    const success = await invokeAction((input: number) => input + 1, 4);
    expect(success.value).toBe(5);
    const failure = await invokeAction(() => { throw new Error('denied'); }, undefined);
    expect(failure.error).toBeInstanceOf(Error);
  });
});
