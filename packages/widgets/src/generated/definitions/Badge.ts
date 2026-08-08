/**
 * Badge public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Badge",
    "category": "display",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": "label",
    "defaults": {},
    "source": "#script\n  prop label: String = \"\"\n  prop variant: String = \"default\"\n  prop class: String = \"\"\n#end script\n\n#view\n  View @badgeWrapper {\n    Text(label) @badgeLabel\n  }\n\n  @badgeWrapper {\n    flow: horizontal\n    items: center\n    content: center\n    inset: badge\n    corner: pill\n    surface: sapphire-900\n    border: sapphire-800\n  }\n\n  @badgeLabel {\n    tone: sapphire-100\n  }\n#end view\n",
    "contractSource": "#script\n  prop label: String = \"\"\n  prop variant: String = \"default\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "label",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "variant",
        "type": "String",
        "required": false,
        "defaultValue": "\"default\"",
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
