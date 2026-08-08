/**
 * Input compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "Input",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": "value",
    "defaults": {},
    "contractSource": "#script\n  prop field: Optional<String>\n  prop value: Optional<String>\n  prop type: Optional<String> = \"text\"\n  prop placeholder: Optional<String> = \"\"\n  prop label: Optional<String>\n  prop disabled: Optional<Bool> = false\n  prop readonly: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop name: Optional<String>\n  prop autoComplete: Optional<String>\n  prop autoFocus: Optional<Bool> = false\n  prop accept: Optional<String>\n  prop ariaLabel: Optional<String>\n  prop maxLength: Optional<Int>\n  prop minLength: Optional<Int>\n  prop pattern: Optional<String>\n  prop error: Optional<String>\n  prop helperText: Optional<String>\n  prop change: Optional<Event<String>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n  prop keyDown: Optional<Event<String>>\n  prop keyUp: Optional<Event<String>>\n#end script\n",
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
        "name": "type",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "placeholder",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "label",
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
        "name": "readonly",
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
        "name": "name",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "autoComplete",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "autoFocus",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      },
      {
        "name": "accept",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "ariaLabel",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "maxLength",
        "type": "Optional<Int>",
        "required": false,
        "event": false
      },
      {
        "name": "minLength",
        "type": "Optional<Int>",
        "required": false,
        "event": false
      },
      {
        "name": "pattern",
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
      },
      {
        "name": "keyDown",
        "type": "Optional<Event<String>>",
        "required": false,
        "event": true
      },
      {
        "name": "keyUp",
        "type": "Optional<Event<String>>",
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
      },
      {
        "name": "keyDown",
        "payloadType": "String"
      },
      {
        "name": "keyUp",
        "payloadType": "String"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
