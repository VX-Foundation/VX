/**
 * Select public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

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
    "source": "#script\n  prop field: Optional<String>\n  prop value: Optional<String>\n  prop options: List<Any>\n  prop placeholder: Optional<String>\n  prop disabled: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop multiple: Optional<Bool> = false\n  prop name: Optional<String>\n  prop size: Optional<String> = \"medium\"\n\n  prop error: Optional<String>\n  prop helperText: Optional<String>\n\n  prop change: Optional<Event<String>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n#end script\n",
    "contractSource": "#script\n  prop field: Optional<String>\n  prop value: Optional<String>\n  prop options: List<Any>\n  prop placeholder: Optional<String>\n  prop disabled: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop multiple: Optional<Bool> = false\n  prop name: Optional<String>\n  prop size: Optional<String> = \"medium\"\n  prop error: Optional<String>\n  prop helperText: Optional<String>\n  prop change: Optional<Event<String>>\n  prop focus: Optional<Event<Void>>\n  prop blur: Optional<Event<Void>>\n#end script\n",
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
        "name": "options",
        "type": "List<Any>",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "placeholder",
        "type": "Optional<String>",
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
        "name": "required",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      },
      {
        "name": "multiple",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
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
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"medium\"",
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
  } as const) satisfies WidgetDefinition;
