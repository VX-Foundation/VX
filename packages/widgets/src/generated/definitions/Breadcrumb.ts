/**
 * Breadcrumb public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Breadcrumb",
    "category": "navigation",
    "nativeElement": "nav",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop separator: String = \"/\"\n  prop class: String = \"\"\n  content default: optional\n#end script\n\n#view\n  View @breadcrumbPath {\n    Content(default)\n  }\n\n  @breadcrumbPath {\n    flow: horizontal\n    items: center\n    gap: sm\n    tone: cloud-400\n  }\n#end view\n",
    "contractSource": "#script\n  prop separator: String = \"/\"\n  prop class: String = \"\"\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "separator",
        "type": "String",
        "required": false,
        "defaultValue": "\"/\"",
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
    "content": [
      {
        "name": "default",
        "cardinality": "optional",
        "required": false
      }
    ]
  } as const) satisfies WidgetDefinition;
