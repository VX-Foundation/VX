/**
 * Tooltip public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Tooltip",
    "category": "feedback",
    "nativeElement": "span",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop contentText: String = \"\"\n  prop position: String = \"top\"\n  prop class: String = \"\"\n  content default: optional\n#end script\n\n#view\n  View @tooltipContainer {\n    Content(default)\n    View @tooltipBubble {\n      Text(contentText) @tooltipText\n    }\n  }\n\n  @tooltipContainer {\n    display: inline-flex\n    stack: true\n  }\n\n  @tooltipBubble {\n    inset: badge\n    corner: sm\n    surface: rock-950\n    border: steel-800\n    elevation: xs\n    z: toast\n  }\n\n  @tooltipText {\n    tone: cloud-50\n  }\n#end view\n",
    "contractSource": "#script\n  prop contentText: String = \"\"\n  prop position: String = \"top\"\n  prop class: String = \"\"\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "contentText",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "position",
        "type": "String",
        "required": false,
        "defaultValue": "\"top\"",
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
