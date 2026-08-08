import { describe, expect, it } from 'vitest';
import { parse } from '@vx-foundation/language';
import { PRIMITIVE_NAMES, PRIMITIVE_SOURCES, WIDGET_REGISTRY } from '../src/index.js';

const migrated = ['Accordion', 'Avatar', 'Breadcrumb', 'DataTable', 'DatePicker', 'Drawer', 'FileUpload', 'Modal', 'Popover', 'Tabs', 'Toast', 'Tooltip', 'VirtualList'] as const;

describe('canonical widget registry', () => {
  it('keeps every registered widget source parseable by the official grammar', () => {
    expect(PRIMITIVE_NAMES).toHaveLength(43);
    for (const name of PRIMITIVE_NAMES) {
      const result = parse(PRIMITIVE_SOURCES[name], `widgets/${name}.vx`);
      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), name).toEqual([]);
    }
  });

  it('contains complete contracts for migrated composite widgets', () => {
    for (const name of migrated) {
      const definition = WIDGET_REGISTRY[name];
      expect(definition.nativeElement, name).toBeTruthy();
      expect(definition.contractSource, name).toContain('#script');
      expect(definition.source, name).not.toMatch(/output\s+\w+\s*\(/u);
      expect(definition.source, name).not.toMatch(/^\s*when\s+[A-Za-z_$][\w$]*\s*$/mu);
    }
  });

  it('models named content regions and event payloads as contracts', () => {
    expect(WIDGET_REGISTRY.Accordion.content).toEqual([{ name: 'default', cardinality: 'optional', required: false }]);
    expect(WIDGET_REGISTRY.Accordion.events).toContainEqual({ name: 'onToggle', payloadType: 'Void' });
    expect(WIDGET_REGISTRY.DatePicker.events).toContainEqual({ name: 'onChange', payloadType: 'String' });
  });
});
