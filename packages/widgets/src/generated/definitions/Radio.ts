/**
 * Radio public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Radio",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {
      "type": "radio"
    },
    "source": "#script\n  prop field: Optional<String>\n  prop selected: Optional<Bool>\n  prop label: Optional<String>\n  prop value: Optional<String>\n  prop name: String\n  prop disabled: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n\n  prop error: Optional<String>\n\n  prop change: Optional<Event<String>>\n#end script\n",
    "contractSource": "#script\n  prop field: Optional<String>\n  prop selected: Optional<Bool>\n  prop label: Optional<String>\n  prop value: Optional<String>\n  prop name: String\n  prop disabled: Optional<Bool> = false\n  prop required: Optional<Bool> = false\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n  prop error: Optional<String>\n  prop change: Optional<Event<String>>\n#end script\n",
    "properties": [
      {
        "name": "field",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "selected",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "label",
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
        "name": "name",
        "type": "String",
        "required": true,
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
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"medium\"",
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"primary\"",
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
        "name": "change",
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
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
