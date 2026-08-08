/**
 * DataTable public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "DataTable",
    "category": "data",
    "nativeElement": "table",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop class: String = \"\"\n  content default: optional\n#end script\n\n#view\n  View @tableContainer {\n    Content(default)\n  }\n\n  @tableContainer {\n    flow: vertical\n    width: fill\n    surface: steel-900\n    border: steel-800\n    corner: lg\n    inset: md\n  }\n#end view\n",
    "contractSource": "#script\n  prop class: String = \"\"\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "class",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      }
    ],
    "events": [],
    "content": [
      {
        "name": "default",
        "cardinality": "optional",
        "required": false
      }
    ]
  } as const) satisfies WidgetDefinition;
