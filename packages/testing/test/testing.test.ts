// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { auditAccessibility, assertDeterministicMarkup, compareHydrationMarkup, compareRgbaSnapshots, contrastRatio, createTestSuite, enforcePerformanceBudget, measurePerformance } from '../src/index.js';

describe('@vx/testing', () => {
  it('runs deterministic official tests with cleanup', async () => {
    let cleaned = false;
    const suite = createTestSuite('core').add({ id: 'unit:one', name: 'one', kind: 'unit', run(context) { context.cleanup(() => { cleaned = true; }); } });
    const report = await suite.run();
    expect(report.failed).toBe(0);
    expect(cleaned).toBe(true);
  });
  it('diagnoses hydration differences', () => expect(compareHydrationMarkup('<p>server</p>', '<p>client</p>').matched).toBe(false));
  it('checks deterministic SSR', async () => expect(await assertDeterministicMarkup(() => '<p>stable</p>')).toBe('<p>stable</p>'));
  it('compares visual buffers', () => expect(compareRgbaSnapshots(new Uint8ClampedArray(4), new Uint8ClampedArray(4), 1, 1).matched).toBe(true));
  it('enforces performance budgets', async () => expect(enforcePerformanceBudget(await measurePerformance(() => undefined, { iterations: 2, warmup: 0 }), { maximumMs: 100 }).passed).toBe(true));
  it('computes WCAG contrast ratios', () => expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(20));
  it('reports deterministic contrast failures through a style provider', () => {
    document.body.innerHTML = '<main><p id="copy">Low contrast</p></main>';
    const audit = auditAccessibility(document.body, { style: () => ({ color: '#777777', backgroundColor: '#888888', fontSizePx: 16, fontWeight: 400 }) });
    expect(audit.issues.some((issue) => issue.code === 'VX_A11Y_CONTRAST' && issue.selector === '#copy')).toBe(true);
  });
});
