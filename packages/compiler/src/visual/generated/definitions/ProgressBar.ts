/**
 * ProgressBar compiler contract generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
import type { CompilerWidgetDefinition } from '../contracts.js';

export const definition = Object.freeze({
    "name": "ProgressBar",
    "category": "feedback",
    "nativeElement": "progress",
    "groups": [],
    "callProperty": null,
    "defaults": {},
    "contractSource": "#script\n  prop value: Float\n  prop max: Optional<Float> = 100\n  prop variant: Optional<String> = \"determinate\"\n  prop size: Optional<String> = \"medium\"\n  prop color: Optional<String> = \"primary\"\n  prop showLabel: Optional<Bool> = false\n#end script\n",
    "properties": [
      {
        "name": "value",
        "type": "Float",
        "required": true,
        "event": false
      },
      {
        "name": "max",
        "type": "Optional<Float>",
        "required": false,
        "event": false
      },
      {
        "name": "variant",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "size",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "color",
        "type": "Optional<String>",
        "required": false,
        "event": false
      },
      {
        "name": "showLabel",
        "type": "Optional<Bool>",
        "required": false,
        "event": false
      }
    ],
    "events": [],
    "content": []
  } as const) satisfies CompilerWidgetDefinition;
