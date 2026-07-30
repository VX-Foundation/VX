import { describe, expect, it } from 'vitest';
import { parse } from '@vx/language';
import { analyze } from '../src/core.js';

function diagnostics(source: string) {
  return analyze(parse(source, '/accessibility.vx').ast).diagnostics;
}

describe('accessibility analysis', () => {
  it('requires accessible names and image intent', () => {
    const result = diagnostics(`#view
  View {
    Image { src: "/hero.png" }
    Button { click => console.log("x") }
    Input { value: "" }
  }
#end view`);
    expect(result.map((item) => item.code)).toEqual(expect.arrayContaining([
      'VX_A11Y_IMAGE_ALT', 'VX_A11Y_BUTTON_NAME', 'VX_A11Y_CONTROL_NAME'
    ]));
  });

  it('accepts explicit labels and decorative media', () => {
    const result = diagnostics(`#view
  View {
    Image {
      src: "/shape.png"
      decorative: true
    }
    Button("Save")
    Input {
      value: ""
      label: "Name"
    }
  }
#end view`);
    expect(result.filter((item) => item.severity === 'error')).toEqual([]);
  });

  it('rejects nested controls and positive tab order', () => {
    const result = diagnostics(`#view
  Button("Outer") {
    Link {
      href: "/"
      text: "Inner"
      tabIndex: 2
    }
  }
#end view`);
    expect(result.map((item) => item.code)).toEqual(expect.arrayContaining(['VX_A11Y_NESTED_INTERACTIVE', 'VX_A11Y_POSITIVE_TABINDEX']));
  });
});
