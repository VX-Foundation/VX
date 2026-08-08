/**
 * Toast public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "Toast",
    "category": "feedback",
    "nativeElement": "div",
    "groups": [
      "container"
    ],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop title: String = \"\"\n  prop message: String = \"\"\n  prop variant: String = \"info\"\n  prop visible: Bool = true\n  prop class: String = \"\"\n\n  output onDismiss: Void\n\n  action dismiss() {\n    emit(\"onDismiss\")\n  }\n#end script\n\n#view\n  if visible {\n    View @toastContainer {\n      View @toastCard {\n        View @toastContent {\n          Text(title) @toastTitle\n          Text(message) @toastMessage\n        }\n        Button(\"✕\") @dismissBtn {\n          click => dismiss()\n        }\n      }\n    }\n  }\n\n  @toastContainer {\n    flow: horizontal\n    items: center\n    content: end\n    inset: md\n    z: toast\n  }\n\n  @toastCard {\n    flow: horizontal\n    items: center\n    content: space-between\n    gap: md\n    inset: md\n    corner: lg\n    elevation: md\n    surface: steel-900\n    border: steel-800\n  }\n\n  @toastContent {\n    flow: vertical\n  }\n\n  @toastTitle {\n    tone: cloud-50\n  }\n\n  @toastMessage {\n    tone: cloud-300\n  }\n\n  @dismissBtn {\n    surface: transparent\n    tone: cloud-400\n    when hover {\n      tone: cloud-50\n    }\n  }\n#end view\n",
    "contractSource": "#script\n  prop title: String = \"\"\n  prop message: String = \"\"\n  prop variant: String = \"info\"\n  prop visible: Bool = true\n  prop class: String = \"\"\n  output onDismiss: Void\n#end script\n",
    "properties": [
      {
        "name": "title",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "message",
        "type": "String",
        "required": false,
        "defaultValue": "\"\"",
        "event": false
      },
      {
        "name": "variant",
        "type": "String",
        "required": false,
        "defaultValue": "\"info\"",
        "event": false
      },
      {
        "name": "visible",
        "type": "Bool",
        "required": false,
        "defaultValue": "true",
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
        "name": "onDismiss",
        "type": "Optional<Event<Void>>",
        "required": false,
        "defaultValue": null,
        "event": true
      }
    ],
    "events": [
      {
        "name": "onDismiss",
        "payloadType": "Void"
      }
    ],
    "content": []
  } as const) satisfies WidgetDefinition;
