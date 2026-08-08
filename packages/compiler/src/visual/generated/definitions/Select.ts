/**
 * Select compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Select",
    "category": "control",
    "nativeElement": "select",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": "value",
    "defaults": {},
    "contractSource": "#script\n  prop field: Optional<String>\n  prop value: Optional<String>\n  prop options: List<Any>\n  prop placeholder: Optional<String>\n  prop disabled: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop multiple: Optional<Bool> = false\n  prop name: Optional<String>\n  prop size: Optional<String> = \"medium\"\n  prop error: Optional<String>\n  prop helperText: Optional<String>\n  prop change: Optional<Event<String>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n#end script\n",
    "properties": [
      {
        "name": "field",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "value",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "options",
        "type": "List<Any>",
        "required": true,
        "event": false
      },
      {
        "name": "placeholder",
        "type": "Optional<String>",
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
        "name": "required",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "multiple",
        "type": "Optional<Bool>",
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
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "error",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "helperText",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "change",
        "type": "Optional<Event<String>>",
        "required": false,
        "event": true
      },
      {
        "name": "focus",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      },
      {
        "name": "blur",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "change",
        "payloadType": "String"
      },
      {
        "name": "focus",
        "payloadType": "Void"
      },
      {
        "name": "blur",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
