/**
 * Slider compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Slider",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {
      "type": "range"
    },
    "contractSource": "#script\n  prop field: Optional<String>\n  prop value: Optional<Float>\n  prop min: Optional<Float> = 0\n  prop max: Optional<Float> = 100\n  prop step: Optional<Float> = 1\n  prop disabled: Optional<Bool> = false\n  prop orientation: Optional<String> = \"horizontal\"\n  prop marks: Optional<Bool> = false\n  prop color: Optional<String> = \"primary\"\n  prop name: Optional<String>\n  prop change: Optional<Event<Float>>\n  prop dragStart: Optional<Event<Void>>\n  prop dragEnd: Optional<Event<Float>>\n#end script\n",
    "properties": [
      {
        "name": "field",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "value",
        "type": "Optional<Float>",
        "required": false,
        "event": false
      },
      {
        "name": "min",
        "type": "Optional<Float>",
        "required": false,
        "event": false
      },
      {
        "name": "max",
        "type": "Optional<Float>",
        "required": false,
        "event": false
      },
      {
        "name": "step",
        "type": "Optional<Float>",
        "required": false,
        "event": false
      },
      {
        "name": "disabled",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "orientation",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "marks",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "name",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "change",
        "type": "Optional<Event<Float>>",
        "required": false,
        "event": true
      },
      {
        "name": "dragStart",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "dragEnd",
        "type": "Optional<Event<Float>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "change",
        "payloadType": "Float"
      },
      {
        "name": "dragStart",
        "payloadType": "Void"
      },
      {
        "name": "dragEnd",
        "payloadType": "Float"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
