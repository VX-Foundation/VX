// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountComponent } from '@vx/testing';

describe('official component testing', () => {
  it('updates state and disposes the mounted component', async () => {
    const host = document.createElement('div');
    const harness = await mountComponent(host, { count: 1 }, (target, props) => {
      const element = document.createElement('output');
      let state = props.count;
      element.textContent = String(state);
      target.append(element);
      return {
        root: element,
        update(next) { state = next.count; element.textContent = String(state); },
        state: () => state
      };
    });
    await harness.update({ count: 2 });
    expect(harness.root.textContent).toBe('2');
    expect(harness.state()).toBe(2);
    await harness.dispose();
    expect(host.childElementCount).toBe(0);
  });
});
