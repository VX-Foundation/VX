/**
 * DatePicker compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "DatePicker",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": "value",
    "defaults": {
      "type": "date"
    },
    "contractSource": "#script\n  prop value: String = \"\"\n  prop placeholder: String = \"Select date...\"\n  prop label: String = \"Select date\"\n  prop class: String = \"\"\n  output onChange: String\n#end script\n",
    "properties": [
      {
        "name": "value",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "placeholder",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "label",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "onChange",
        "type": "Optional<Event<String>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onChange",
        "payloadType": "String"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
