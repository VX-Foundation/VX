import type { Cleanup } from './dom.js';

export interface ThemeDefinition {
  name: string;
  tokens: Readonly<Record<string, string | number>>;
  modes?: Readonly<Record<string, Readonly<Record<string, string | number>>>>;
}

export function defineTheme(theme: ThemeDefinition): ThemeDefinition {
  if (!theme.name.trim()) throw new TypeError('VX theme name cannot be empty.');
  return Object.freeze({
    name: theme.name,
    tokens: Object.freeze({ ...theme.tokens }),
    ...(theme.modes ? { modes: Object.freeze({ ...theme.modes }) } : {})
  });
}

export function installTheme(target: HTMLElement, theme: ThemeDefinition, mode?: string): Cleanup {
  const previousTheme = target.dataset['vxTheme'];
  const previousMode = target.dataset['vxThemeMode'];
  const previous = new Map<string, string>();

  target.dataset['vxTheme'] = theme.name;
  if (mode) target.dataset['vxThemeMode'] = mode;
  else delete target.dataset['vxThemeMode'];

  const tokens = { ...theme.tokens, ...(mode ? theme.modes?.[mode] ?? {} : {}) };
  for (const [name, value] of Object.entries(tokens)) {
    const property = `--vx-theme-${name.replace(/\./g, '-')}`;
    previous.set(property, target.style.getPropertyValue(property));
    target.style.setProperty(property, String(value));
  }

  return () => {
    for (const [property, value] of previous) {
      if (value) target.style.setProperty(property, value);
      else target.style.removeProperty(property);
    }
    if (previousTheme) target.dataset['vxTheme'] = previousTheme;
    else delete target.dataset['vxTheme'];
    if (previousMode) target.dataset['vxThemeMode'] = previousMode;
    else delete target.dataset['vxThemeMode'];
  };
}
