/**
 * DatePicker public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "DatePicker",
    "category": "control",
    "nativeElement": "input",
    "groups": [
      "control",
      "formControl",
      "interactive"
    ],
    "callProperty": "value",
    "defaults": {
      "type": "date"
    },
    "source": "#script\n  prop value: String = \"\"\n  prop placeholder: String = \"Select date...\"\n  prop label: String = \"Select date\"\n  prop class: String = \"\"\n\n  output onChange: String\n\n  action notifyChange(nextValue: String) {\n    emit(\"onChange\", nextValue)\n  }\n#end script\n\n#view\n  Input @dateInput {\n    value: value\n    placeholder: placeholder\n    ariaLabel: label\n    type: \"date\"\n    change => notifyChange($event)\n  }\n\n  @dateInput {\n    surface: steel-900\n    border: steel-800\n    tone: cloud-50\n    corner: md\n    inset: control.md\n  }\n#end view\n",
    "contractSource": "#script\n  prop value: String = \"\"\n  prop placeholder: String = \"Select date...\"\n  prop label: String = \"Select date\"\n  prop class: String = \"\"\n  output onChange: String\n#end script\n",
    "properties": [
      {
        "name": "value",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "placeholder",
        "type": "String",
        "required": false,
        "defaultValue": "\"Select date...\"",
        "event": false
      },
      {
        "name": "label",
        "type": "String",
        "required": false,
        "defaultValue": "\"Select date\"",
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
        "name": "onChange",
        "type": "Optional<Event<String>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onChange",
        "payloadType": "String"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
