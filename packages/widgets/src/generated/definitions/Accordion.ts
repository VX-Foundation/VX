/**
 * Accordion public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Accordion",
    "category": "composite",
    "nativeElement": "details",
    "groups": [
      "container",
      "interactive"
    ],
    "callProperty": "title",
    "defaults": {},
    "source": "#script\n  prop title: String = \"\"\n  prop expanded: Bool = false\n  prop class: String = \"\"\n\n  output onToggle: Void\n  content default: optional\n\n  action toggle() {\n    emit(\"onToggle\")\n  }\n#end script\n\n#view\n  View @accordionCard {\n    View @accordionHeader {\n      Text(title) @accordionTitle\n      Button(\"▼\") @accordionIcon {\n        click => toggle()\n      }\n    }\n    if expanded {\n      View @accordionBody {\n        Content(default)\n      }\n    }\n  }\n\n  @accordionCard {\n    flow: vertical\n    surface: steel-900\n    border: steel-800\n    corner: lg\n    inset: md\n  }\n\n  @accordionHeader {\n    flow: horizontal\n    content: space-between\n    items: center\n  }\n\n  @accordionTitle {\n    tone: cloud-50\n  }\n\n  @accordionIcon {\n    surface: transparent\n    tone: cloud-400\n  }\n\n  @accordionBody {\n    flow: vertical\n    inset: md\n    tone: cloud-200\n  }\n#end view\n",
    "contractSource": "#script\n  prop title: String = \"\"\n  prop expanded: Bool = false\n  prop class: String = \"\"\n  output onToggle: Void\n  content default: optional\n#end script\n",
    "properties": [
      {
        "name": "title",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "expanded",
        "type": "Bool",
        "required": false,
        "defaultValue": "false",
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
        "name": "onToggle",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onToggle",
        "payloadType": "Void"
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
