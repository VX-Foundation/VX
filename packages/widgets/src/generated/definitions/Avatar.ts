/**
 * Avatar public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Avatar",
    "category": "display",
    "nativeElement": "span",
    "groups": [
      "text"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop name: String = \"User\"\n  prop src: String = \"\"\n  prop size: String = \"md\"\n  prop class: String = \"\"\n#end script\n\n#view\n  View @avatarWrapper {\n    if src != \"\" {\n      Image @avatarImage {\n        src: src\n        alt: name\n      }\n    } else {\n      Text(name) @avatarInitials\n    }\n  }\n\n  @avatarWrapper {\n    flow: horizontal\n    items: center\n    content: center\n    corner: round\n    surface: steel-800\n    border: steel-700\n  }\n\n  @avatarImage {\n    corner: round\n  }\n\n  @avatarInitials {\n    tone: cloud-50\n  }\n#end view\n",
    "contractSource": "#script\n  prop name: String = \"User\"\n  prop src: String = \"\"\n  prop size: String = \"md\"\n  prop class: String = \"\"\n#end script\n",
    "properties": [
      {
        "name": "name",
        "type": "String",
        "required": false,
        "defaultValue": "\"User\"",
        "event": false
      },
      {
        "name": "src",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
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
