/**
 * TextArea public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "TextArea",
    "category": "control",
    "nativeElement": "textarea",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": "value",
    "defaults": {},
    "source": "#script\n  prop field: Optional<String>\n  prop value: Optional<String>\n  prop placeholder: Optional<String> = \"\"\n  prop rows: Optional<Int> = 3\n  prop minRows: Optional<Int>\n  prop maxRows: Optional<Int>\n  prop disabled: Optional<Bool> = false\n  prop readonly: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop maxLength: Optional<Int>\n  prop resize: Optional<String> = \"none\"\n  prop name: Optional<String>\n\n  prop error: Optional<String>\n  prop helperText: Optional<String>\n\n  prop change: Optional<Event<String>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n  prop keyDown: Optional<Event<String>>\n#end script\n",
    "contractSource": "#script\n  prop field: Optional<String>\n  prop value: Optional<String>\n  prop placeholder: Optional<String> = \"\"\n  prop rows: Optional<Int> = 3\n  prop minRows: Optional<Int>\n  prop maxRows: Optional<Int>\n  prop disabled: Optional<Bool> = false\n  prop readonly: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop maxLength: Optional<Int>\n  prop resize: Optional<String> = \"none\"\n  prop name: Optional<String>\n  prop error: Optional<String>\n  prop helperText: Optional<String>\n  prop change: Optional<Event<String>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n  prop keyDown: Optional<Event<String>>\n#end script\n",
    "properties": [
      {
        "name": "field",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "value",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "placeholder",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "rows",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": "3",
        "event": false
      },
      {
        "name": "minRows",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "maxRows",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "disabled",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "readonly",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "required",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "maxLength",
        "type": "Optional<Int>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "resize",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"none\"",
        "event": false
      },
      {
        "name": "name",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "error",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "helperText",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "change",
        "type": "Optional<Event<String>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "focus",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "blur",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      },
      {
        "name": "keyDown",
        "type": "Optional<Event<String>>",
        "required": false,
        "defaultValue": null,
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
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
