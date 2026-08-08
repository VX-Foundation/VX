/**
 * FieldGroup public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "FieldGroup",
    "category": "form",
    "nativeElement": "fieldset",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop label: Optional<String>\n  prop description: Optional<String>\n  prop required: Optional<Bool> = false\n#end script\n",
    "contractSource": "#script\n  prop label: Optional<String>\n  prop description: Optional<String>\n  prop required: Optional<Bool> = false\n#end script\n",
    "properties": [
      {
        "name": "label",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "description",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "required",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
