/**
 * VirtualList public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "VirtualList",
    "category": "data",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop itemHeight: Int = 40\n  prop class: String = \"\"\n  content default: optional\n#end script\n\n#view\n  ScrollView @virtualScroll {\n    Content(default)\n  }\n\n  @virtualScroll {\n    flow: vertical\n    height: fill\n    width: fill\n  }\n#end view\n",
    "contractSource": "#script\n  prop itemHeight: Int = 40\n  prop class: String = \"\"\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "itemHeight",
        "type": "Int",
        "required": false,
        "defaultValue": "40",
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
