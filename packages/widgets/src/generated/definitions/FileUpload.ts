/**
 * FileUpload public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

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
    "source": "#script\n  prop accept: String = \"*/*\"\n  prop label: String = \"Drag and drop files here, or click to browse\"\n  prop class: String = \"\"\n\n  output onSelect: Void\n\n  action selectFiles() {\n    emit(\"onSelect\")\n  }\n#end script\n\n#view\n  View @uploadZone {\n    Text(label) @uploadLabel\n    Input @fileInput {\n      type: \"file\"\n      accept: accept\n      ariaLabel: label\n      change => selectFiles()\n    }\n  }\n\n  @uploadZone {\n    flow: vertical\n    items: center\n    content: center\n    inset: xl\n    corner: lg\n    surface: steel-900\n    border: steel-700\n    borderStyle: dashed\n  }\n\n  @uploadLabel {\n    tone: cloud-300\n  }\n\n  @fileInput {\n    opacity: hidden\n  }\n#end view\n",
    "contractSource": "#script\n  prop accept: String = \"*/*\"\n  prop label: String = \"Drag and drop files here, or click to browse\"\n  prop class: String = \"\"\n  output onSelect: Void\n#end script\n",
    "properties": [
      {
        "name": "accept",
        "type": "String",
        "required": false,
        "defaultValue": "\"*/*\"",
        "event": false
      },
      {
        "name": "label",
        "type": "String",
        "required": false,
        "defaultValue": "\"Drag and drop files here, or click to browse\"",
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
        "name": "onSelect",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
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
  } as const) satisfies WidgetDefinition;
