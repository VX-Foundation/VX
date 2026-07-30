export type EnvironmentParser<T> = (value: string, name: string) => T;

export interface EnvironmentField<T> {
  parse: EnvironmentParser<T>;
  optional?: boolean;
  default?: T;
  secret?: boolean;
}

export type EnvironmentSchema = Readonly<Record<string, EnvironmentField<unknown>>>;
export type ParsedEnvironment<TSchema extends EnvironmentSchema> = { readonly [K in keyof TSchema]: TSchema[K] extends EnvironmentField<infer T> ? T : never };

export function readServerEnvironment<TSchema extends EnvironmentSchema>(schema: TSchema, source: Readonly<Record<string, string | undefined>> = process.env): ParsedEnvironment<TSchema> {
  const output: Record<string, unknown> = Object.create(null);
  const failures: string[] = [];
  for (const [name, field] of Object.entries(schema)) {
    const raw = source[name];
    if (raw === undefined || raw === '') {
      if ('default' in field) { output[name] = field.default; continue; }
      if (field.optional) { output[name] = undefined; continue; }
      failures.push(`${name} is required.`);
      continue;
    }
    try { output[name] = field.parse(raw, name); } catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (failures.length) throw new AggregateError(failures.map((message) => new TypeError(message)), 'Invalid VX server environment.');
  return Object.freeze(output) as ParsedEnvironment<TSchema>;
}

export const env = Object.freeze({
  string: (options: { minLength?: number; maxLength?: number } = {}): EnvironmentParser<string> => (value, name) => {
    if (options.minLength !== undefined && value.length < options.minLength) throw new TypeError(`${name} is too short.`);
    if (options.maxLength !== undefined && value.length > options.maxLength) throw new TypeError(`${name} is too long.`);
    return value;
  },
  integer: (options: { min?: number; max?: number } = {}): EnvironmentParser<number> => (value, name) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new TypeError(`${name} must be an integer.`);
    if (options.min !== undefined && parsed < options.min) throw new TypeError(`${name} is below the minimum.`);
    if (options.max !== undefined && parsed > options.max) throw new TypeError(`${name} exceeds the maximum.`);
    return parsed;
  },
  boolean: (): EnvironmentParser<boolean> => (value, name) => {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new TypeError(`${name} must be true or false.`);
  },
  url: (): EnvironmentParser<URL> => (value) => new URL(value),
  enum: <T extends string>(values: readonly T[]): EnvironmentParser<T> => (value, name) => {
    if (!values.includes(value as T)) throw new TypeError(`${name} must be one of ${values.join(', ')}.`);
    return value as T;
  }
});
