/**
 * Tabs public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Tabs",
    "category": "navigation",
    "nativeElement": "div",
    "groups": [
      "container",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop activeTab: String = \"\"\n  prop class: String = \"\"\n\n  output onTabChange: String\n  content default: optional\n#end script\n\n#view\n  View @tabsWrapper {\n    View @tabsHeader {\n      Content(default)\n    }\n  }\n\n  @tabsWrapper {\n    flow: vertical\n    gap: md\n  }\n\n  @tabsHeader {\n    flow: horizontal\n    gap: sm\n    borderBottom: steel-800\n    inset: sm\n  }\n#end view\n",
    "contractSource": "#script\n  prop activeTab: String = \"\"\n  prop class: String = \"\"\n  output onTabChange: String\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "activeTab",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "onTabChange",
        "type": "Optional<Event<String>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onTabChange",
        "payloadType": "String"
      }
    ],
    "content": [
      {
        "name": "default",
        "cardinality": "optional",
        "required": false
      }
    ]
  } as const) satisfies WidgetDefinition;
