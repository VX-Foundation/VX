/**
 * ProgressBar public contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { WidgetDefinition } from '../../contracts.js';

export const definition = Object.freeze({
    "name": "ProgressBar",
    "category": "feedback",
    "nativeElement": "progress",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "source": "#script\n  prop value: Float\n  prop max: Optional<Float> = 100\n  prop variant: Optional<String> = \"determinate\"\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n  prop showLabel: Optional<Bool> = false\n#end script\n",
    "contractSource": "#script\n  prop value: Float\n  prop max: Optional<Float> = 100\n  prop variant: Optional<String> = \"determinate\"\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n  prop showLabel: Optional<Bool> = false\n#end script\n",
    "properties": [
      {
        "name": "value",
        "type": "Float",
        "required": true,
        "defaultValue": null,
        "event": false
      },
      {
        "name": "max",
        "type": "Optional<Float>",
        "required": false,
        "defaultValue": "100",
        "event": false
      },
      {
        "name": "variant",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"determinate\"",
        "event": false
      },
      {
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"medium\"",
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "defaultValue": "\"primary\"",
        "event": false
      },
      {
        "name": "showLabel",
        "type": "Optional<Bool>",
        "required": false,
        "defaultValue": "false",
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies WidgetDefinition;
