import { describe, expect, it } from 'vitest';
import { parse } from '@vx/language';
import { analyze, lower } from '../src/index.js';

describe('VX Visual IR', () => {
  it('resolves structural and semantic roles into scoped target-neutral IR', () => {
    const parsed = parse(`#script
  state compact: Bool = false
#end script
#view
  View @grid(min: 240, gap: lg) @catalog {
    Title("Products") @title
  }

  @catalog uses @card {
    inset: compact ? md : xl
    when hover { elevation: md }
    when viewport(max: md) { inset: md }
  }
#end view`, 'visual-ir.vx');

    expect(parsed.diagnostics).toHaveLength(0);
    const result = analyze(parsed.ast);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.visual?.nodes).toHaveLength(2);
    expect(result.visual?.roleNames).toEqual(['catalog', 'grid', 'title']);
    expect(result.visual?.cssText).toContain('container-type: inline-size');
    expect(result.visual?.cssText).toContain('@media (max-width: 48rem)');
    expect(result.visual?.cssText).not.toMatch(/\.catalog\b|\.title\b/);

    const output = lower(parsed.ast, result.graph, result.visual);
    expect(output.clientCode).toContain('setVisualProperty');
    expect(output.clientCode).toContain('ctx.compact.value ? "md" : "xl"');
  });

  it('rejects unknown visual vocabulary and composition cycles', () => {
    const unknown = parse(`#view
  View @broken {}
  @broken { imaginary: lg }
#end view`, 'unknown-visual.vx');
    const unknownResult = analyze(unknown.ast);
    expect(unknownResult.diagnostics.some((diagnostic) => diagnostic.code === 'VX_VISUAL_UNKNOWN_PROPERTY')).toBe(true);

    const cyclic = parse(`#view
  View @a {}
  @a uses @b {}
  @b uses @a {}
#end view`, 'cyclic-visual.vx');
    const cyclicResult = analyze(cyclic.ast);
    expect(cyclicResult.diagnostics.some((diagnostic) => diagnostic.code === 'VX_VISUAL_ROLE_CYCLE')).toBe(true);
  });
});
