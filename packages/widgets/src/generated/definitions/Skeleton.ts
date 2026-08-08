/**
 * Skeleton public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Skeleton",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop width: String = \"fill\"\n  prop height: String = \"md\"\n  prop class: String = \"\"\n#end script\n\n#view\n  View @skeletonBox {}\n\n  @skeletonBox {\n    surface: steel-800\n    corner: md\n    motion: smooth\n    opacity: loading\n  }\n#end view\n",
    "contractSource": "#script\n  prop width: String = \"fill\"\n  prop height: String = \"md\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "width",
        "type": "String",
        "required": false,
        "defaultValue": "\"fill\"",
        "event": false
      },
      {
        "name": "height",
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
