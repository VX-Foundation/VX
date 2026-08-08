/**
 * Spinner public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Spinner",
    "category": "feedback",
    "nativeElement": "span",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop size: String = \"md\"\n  prop class: String = \"\"\n#end script\n\n#view\n  View @spinnerRing {}\n\n  @spinnerRing {\n    corner: round\n    border: steel-700\n    borderTop: cherry-500\n    motion: smooth\n  }\n#end view\n",
    "contractSource": "#script\n  prop size: String = \"md\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "size",
        "type": "String",
        "required": false,
        "defaultValue": "\"md\"",
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
