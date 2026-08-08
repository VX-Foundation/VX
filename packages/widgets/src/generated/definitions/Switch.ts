/**
 * Switch public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Switch",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {
      "type": "checkbox",
      "role": "switch"
    },
    "source": "#script\n  prop field: Optional<String>\n  prop checked: Optional<Bool>\n  prop disabled: Optional<Bool> = false\n  prop label: Optional<String>\n  prop labelPlacement: Optional<String> = \"end\"\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n  prop name: Optional<String>\n\n  prop change: Optional<Event<Bool>>\n#end script\n",
    "contractSource": "#script\n  prop field: Optional<String>\n  prop checked: Optional<Bool>\n  prop disabled: Optional<Bool> = false\n  prop label: Optional<String>\n  prop labelPlacement: Optional<String> = \"end\"\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n  prop name: Optional<String>\n  prop change: Optional<Event<Bool>>\n#end script\n",
    "properties": [
      {
        "name": "field",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "checked",
        "type": "Optional<Bool>",
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
        "name": "label",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "labelPlacement",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"end\"",
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
        "name": "name",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "change",
        "type": "Optional<Event<Bool>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "change",
        "payloadType": "Bool"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
