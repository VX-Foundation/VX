/**
 * FileUpload compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "FileUpload",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": null,
    "defaults": {
      "type": "file"
    },
    "contractSource": "#script\n  prop accept: String = \"*/*\"\n  prop label: String = \"Drag and drop files here, or click to browse\"\n  prop class: String = \"\"\n  output onSelect: Void\n#end script\n",
    "properties": [
      {
        "name": "accept",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "label",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "class",
        "type": "String",
        "required": false,
        "event": false
      },
      {
        "name": "onSelect",
        "type": "Optional<Event<Void>>",
        "required": false,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onSelect",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
