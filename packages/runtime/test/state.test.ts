import { describe, expect, it } from 'vitest';
import { derive, effect, state } from '../src/state.js';

describe('signals and scheduler', () => {
  it('evaluates derived values from state', () => {
    const count = state(0);
    const doubled = derive(() => count.value * 2);
    expect(doubled.value).toBe(0);
  });

  it('batches repeated updates into one microtask flush', async () => {
    const count = state(0);
    const doubled = derive(() => count.value * 2);
    let runs = 0;

    const subscription = effect(() => {
      void doubled.value;
      runs += 1;
    });

    expect(runs).toBe(1);
    count.value = 1;
    count.value = 2;
    expect(runs).toBe(1);

    await Promise.resolve();
    expect(runs).toBe(2);
    expect(doubled.value).toBe(4);
    subscription.dispose();
  });

  it('retracks conditional dependencies and releases stale ones', async () => {
    const a = state(1);
    const b = state(2);
    const useA = state(true);
    let runs = 0;

    const subscription = effect(() => {
      runs += 1;
      if (useA.value) void a.value;
      else void b.value;
    });

    useA.value = false;
    await Promise.resolve();
    expect(runs).toBe(2);

    b.value = 10;
    await Promise.resolve();
    expect(runs).toBe(3);

    a.value = 10;
    await Promise.resolve();
    expect(runs).toBe(3);
    subscription.dispose();
  });

  it('stops an effect after disposal', async () => {
    const count = state(0);
    let runs = 0;
    const subscription = effect(() => {
      void count.value;
      runs += 1;
    });

    subscription.dispose();
    count.value = 1;
    await Promise.resolve();
    expect(runs).toBe(1);
  });
});
