import type { FileLike, Schema, SchemaDescription, ValidationContext, ValidationIssue, ValidationResult } from './types.js';

interface Rule<T> {
  name: string;
  params: Readonly<Record<string, unknown>>;
  run(value: T, context: ValidationContext): string | ValidationIssue | void | Promise<string | ValidationIssue | void>;
}

abstract class BaseSchema<T> implements Schema<T> {
  abstract readonly kind: string;
  protected readonly rules: Rule<T>[] = [];
  constructor(public readonly optional = false) {}

  protected abstract coerce(input: unknown, context: ValidationContext): { value?: T; issue?: ValidationIssue };
  protected abstract recreate(optional: boolean): BaseSchema<T>;

  protected addRule(rule: Rule<T>): this {
    this.rules.push(rule);
    return this;
  }

  optionalValue(): BaseSchema<T | undefined> {
    return this.recreate(true) as unknown as BaseSchema<T | undefined>;
  }

  parse(input: unknown, partial: Partial<ValidationContext> = {}): ValidationResult<T> {
    const context = makeContext(input, partial);
    const base = this.coerce(input, context);
    if (base.issue) return { success: false, issues: [base.issue] };
    if (base.value === undefined && this.optional) return { success: true, value: base.value as T, issues: [] };
    const issues: ValidationIssue[] = [];
    for (const rule of this.rules) {
      const result = rule.run(base.value as T, context);
      if (result instanceof Promise) throw new TypeError(`Schema '${this.kind}' contains asynchronous validation; use parseAsync().`);
      appendIssue(issues, result, context.path, context.phase, rule.name);
    }
    return issues.length ? { success: false, issues } : { success: true, value: base.value as T, issues: [] };
  }

  async parseAsync(input: unknown, partial: Partial<ValidationContext> = {}): Promise<ValidationResult<T>> {
    const context = makeContext(input, partial);
    const base = this.coerce(input, context);
    if (base.issue) return { success: false, issues: [base.issue] };
    if (base.value === undefined && this.optional) return { success: true, value: base.value as T, issues: [] };
    const issues: ValidationIssue[] = [];
    for (const rule of this.rules) appendIssue(issues, await rule.run(base.value as T, context), context.path, context.phase, rule.name);
    return issues.length ? { success: false, issues } : { success: true, value: base.value as T, issues: [] };
  }

  describe(): SchemaDescription {
    return { kind: this.kind, optional: this.optional, rules: this.rules.map((rule) => ({ name: rule.name, ...rule.params })) };
  }
}

class StringSchema extends BaseSchema<string> {
  readonly kind = 'string';
  protected recreate(optional: boolean): StringSchema { return new StringSchema(optional); }
  protected coerce(input: unknown, context: ValidationContext) {
    if ((input === undefined || input === null || input === '') && this.optional) return { value: undefined as unknown as string };
    return typeof input === 'string' ? { value: input } : { issue: issue(context, 'type.string', 'Expected text.') };
  }
  min(length: number, message = `Must contain at least ${length} characters.`): this { return this.addRule({ name: 'min', params: { length }, run: (value) => value.length < length ? message : undefined }); }
  max(length: number, message = `Must contain at most ${length} characters.`): this { return this.addRule({ name: 'max', params: { length }, run: (value) => value.length > length ? message : undefined }); }
  pattern(pattern: RegExp, message = 'Invalid format.'): this { return this.addRule({ name: 'pattern', params: { source: pattern.source, flags: pattern.flags }, run: (value) => pattern.test(value) ? undefined : message }); }
  email(message = 'Enter a valid email address.'): this { return this.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, message); }
  url(message = 'Enter a valid URL.'): this { return this.addRule({ name: 'url', params: {}, run: (value) => { try { new URL(value); } catch { return message; } } }); }
  trim(): this { return this.addRule({ name: 'trim', params: {}, run: (value) => value === value.trim() ? undefined : 'Leading or trailing whitespace is not allowed.' }); }
  sensitive(): this { return this.addRule({ name: 'sensitive', params: {}, run: () => undefined }); }
}

class NumberSchema extends BaseSchema<number> {
  readonly kind = 'number';
  constructor(optional = false, private readonly integerOnly = false) { super(optional); }
  protected recreate(optional: boolean): NumberSchema { return new NumberSchema(optional, this.integerOnly); }
  protected coerce(input: unknown, context: ValidationContext) {
    if ((input === undefined || input === null || input === '') && this.optional) return { value: undefined as unknown as number };
    const value = typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : Number.NaN;
    if (!Number.isFinite(value)) return { issue: issue(context, 'type.number', 'Expected a number.') };
    if (this.integerOnly && !Number.isInteger(value)) return { issue: issue(context, 'type.integer', 'Expected an integer.') };
    return { value };
  }
  min(limit: number, message = `Must be at least ${limit}.`): this { return this.addRule({ name: 'min', params: { limit }, run: (value) => value < limit ? message : undefined }); }
  max(limit: number, message = `Must be at most ${limit}.`): this { return this.addRule({ name: 'max', params: { limit }, run: (value) => value > limit ? message : undefined }); }
}

class BooleanSchema extends BaseSchema<boolean> {
  readonly kind = 'boolean';
  protected recreate(optional: boolean): BooleanSchema { return new BooleanSchema(optional); }
  protected coerce(input: unknown, context: ValidationContext) {
    if ((input === undefined || input === null || input === '') && this.optional) return { value: undefined as unknown as boolean };
    if (typeof input === 'boolean') return { value: input };
    if (input === 'true' || input === 'on' || input === '1') return { value: true };
    if (input === 'false' || input === '0' || input === '') return { value: false };
    return { issue: issue(context, 'type.boolean', 'Expected a boolean value.') };
  }
}

class DateSchema extends BaseSchema<Date> {
  readonly kind = 'date';
  protected recreate(optional: boolean): DateSchema { return new DateSchema(optional); }
  protected coerce(input: unknown, context: ValidationContext) {
    if ((input === undefined || input === null || input === '') && this.optional) return { value: undefined as unknown as Date };
    const value = input instanceof Date ? input : new Date(String(input));
    return Number.isNaN(value.getTime()) ? { issue: issue(context, 'type.date', 'Expected a valid date.') } : { value };
  }
}

class FileSchema extends BaseSchema<FileLike> {
  readonly kind = 'file';
  protected recreate(optional: boolean): FileSchema { return new FileSchema(optional); }
  protected coerce(input: unknown, context: ValidationContext) {
    if ((input === undefined || input === null || input === '') && this.optional) return { value: undefined as unknown as FileLike };
    if (!isFileLike(input)) return { issue: issue(context, 'type.file', 'Expected a file.') };
    return { value: input };
  }
  maxSize(bytes: number, message = `File must not exceed ${bytes} bytes.`): this { return this.addRule({ name: 'maxSize', params: { bytes }, run: (value) => value.size > bytes ? message : undefined }); }
  mime(...types: string[]): this { return this.addRule({ name: 'mime', params: { types }, run: (value) => types.includes(value.type) ? undefined : `File type '${value.type || 'unknown'}' is not allowed.` }); }
  extension(...extensions: string[]): this { const normalized = extensions.map((entry) => entry.replace(/^\./, '').toLowerCase()); return this.addRule({ name: 'extension', params: { extensions: normalized }, run: (value) => normalized.includes(value.name.split('.').pop()?.toLowerCase() ?? '') ? undefined : 'File extension is not allowed.' }); }
}

class ArraySchema<T> extends BaseSchema<T[]> {
  readonly kind = 'array';
  constructor(private readonly itemSchema: Schema<T>, optional = false) { super(optional); }
  protected recreate(optional: boolean): ArraySchema<T> { return new ArraySchema(this.itemSchema, optional); }
  protected coerce(input: unknown, _context: ValidationContext) {
    if ((input === undefined || input === null) && this.optional) return { value: undefined as unknown as T[] };
    return { value: (Array.isArray(input) ? input : [input]) as T[] };
  }
  min(length: number): this { return this.addRule({ name: 'min', params: { length }, run: (value) => value.length < length ? `Select at least ${length} item(s).` : undefined }); }
  max(length: number): this { return this.addRule({ name: 'max', params: { length }, run: (value) => value.length > length ? `Select at most ${length} item(s).` : undefined }); }
  override parse(input: unknown, partial: Partial<ValidationContext> = {}): ValidationResult<T[]> {
    const base = super.parse(input, partial);
    if (!base.success || base.value === undefined) return base;
    const issues: ValidationIssue[] = [];
    const values: T[] = [];
    base.value.forEach((entry, index) => {
      const result = this.itemSchema.parse(entry, { ...partial, root: partial.root ?? input, path: joinPath(partial.path ?? '', String(index)) });
      issues.push(...result.issues);
      if (result.success) values.push(result.value as T);
    });
    return issues.length ? { success: false, issues } : { success: true, value: values, issues: [] };
  }
  override async parseAsync(input: unknown, partial: Partial<ValidationContext> = {}): Promise<ValidationResult<T[]>> {
    const base = await super.parseAsync(input, partial);
    if (!base.success || base.value === undefined) return base;
    const results = await Promise.all(base.value.map((entry, index) => this.itemSchema.parseAsync(entry, { ...partial, root: partial.root ?? input, path: joinPath(partial.path ?? '', String(index)) })));
    const issues = results.flatMap((result) => result.issues);
    return issues.length ? { success: false, issues } : { success: true, value: results.map((result) => result.value as T), issues: [] };
  }
  override describe(): SchemaDescription { return { ...super.describe(), item: this.itemSchema.describe() }; }
}

class ObjectSchema<T extends Record<string, unknown>> extends BaseSchema<T> {
  readonly kind = 'object';
  constructor(private readonly fields: { [K in keyof T]: Schema<T[K]> }, optional = false) { super(optional); }
  protected recreate(optional: boolean): ObjectSchema<T> { return new ObjectSchema(this.fields, optional); }
  protected coerce(input: unknown, context: ValidationContext) {
    if ((input === undefined || input === null) && this.optional) return { value: undefined as unknown as T };
    return input && typeof input === 'object' && !Array.isArray(input) ? { value: input as T } : { issue: issue(context, 'type.object', 'Expected an object.') };
  }
  override parse(input: unknown, partial: Partial<ValidationContext> = {}): ValidationResult<T> {
    const base = super.parse(input, partial);
    if (!base.success || base.value === undefined) return base;
    const output = Object.create(null) as T;
    const issues: ValidationIssue[] = [];
    for (const [name, field] of Object.entries(this.fields) as [keyof T & string, Schema<T[keyof T]>][]) {
      const result = field.parse((base.value as Record<string, unknown>)[name], { ...partial, root: partial.root ?? input, path: joinPath(partial.path ?? '', name) });
      issues.push(...result.issues);
      if (result.success) output[name] = result.value as T[typeof name];
    }
    return issues.length ? { success: false, issues } : { success: true, value: output, issues: [] };
  }
  override async parseAsync(input: unknown, partial: Partial<ValidationContext> = {}): Promise<ValidationResult<T>> {
    const base = await super.parseAsync(input, partial);
    if (!base.success || base.value === undefined) return base;
    const output = Object.create(null) as T;
    const issues: ValidationIssue[] = [];
    for (const [name, field] of Object.entries(this.fields) as [keyof T & string, Schema<T[keyof T]>][]) {
      const result = await field.parseAsync((base.value as Record<string, unknown>)[name], { ...partial, root: partial.root ?? input, path: joinPath(partial.path ?? '', name) });
      issues.push(...result.issues);
      if (result.success) output[name] = result.value as T[typeof name];
    }
    return issues.length ? { success: false, issues } : { success: true, value: output, issues: [] };
  }
  override describe(): SchemaDescription { return { ...super.describe(), fields: Object.fromEntries(Object.entries(this.fields).map(([name, field]) => [name, field.describe()])) }; }


}

class CustomSchema<T> extends BaseSchema<T> {
  readonly kind = 'custom';
  constructor(private readonly validator: (input: unknown, context: ValidationContext) => T | string | ValidationIssue | Promise<T | string | ValidationIssue>, optional = false) { super(optional); }
  protected recreate(optional: boolean): CustomSchema<T> { return new CustomSchema(this.validator, optional); }
  protected coerce(input: unknown) { return { value: input as T }; }
  override parse(input: unknown, partial: Partial<ValidationContext> = {}): ValidationResult<T> {
    const context = makeContext(input, partial);
    const result = this.validator(input, context);
    if (result instanceof Promise) throw new TypeError('Custom schema is asynchronous; use parseAsync().');
    return customResult(result, context);
  }
  override async parseAsync(input: unknown, partial: Partial<ValidationContext> = {}): Promise<ValidationResult<T>> {
    const context = makeContext(input, partial);
    return customResult(await this.validator(input, context), context);
  }
}

export const schema = Object.freeze({
  string: () => new StringSchema(),
  email: () => new StringSchema().email(),
  number: () => new NumberSchema(),
  integer: () => new NumberSchema(false, true),
  boolean: () => new BooleanSchema(),
  date: () => new DateSchema(),
  file: () => new FileSchema(),
  array: <T>(item: Schema<T>) => new ArraySchema(item),
  object: <T extends Record<string, unknown>>(fields: { [K in keyof T]: Schema<T[K]> }) => new ObjectSchema(fields),
  custom: <T>(validator: (input: unknown, context: ValidationContext) => T | string | ValidationIssue | Promise<T | string | ValidationIssue>) => new CustomSchema(validator),
  optional: <T>(value: Schema<T>): Schema<T | undefined> => value instanceof BaseSchema ? value.optionalValue() : ({ ...value, optional: true } as Schema<T | undefined>)
});

export function refine<T>(value: Schema<T>, name: string, validator: (value: T, context: ValidationContext) => string | ValidationIssue | void | Promise<string | ValidationIssue | void>, params: Readonly<Record<string, unknown>> = {}): Schema<T> {
  if (!(value instanceof BaseSchema)) throw new TypeError('refine() requires a VX schema instance.');
  return value['addRule']({ name, params, run: validator });
}

function makeContext(root: unknown, partial: Partial<ValidationContext>): ValidationContext {
  return { phase: partial.phase ?? 'submit', root: partial.root ?? root, path: partial.path ?? '', ...(partial.signal ? { signal: partial.signal } : {}) };
}
function issue(context: ValidationContext, code: string, message: string): ValidationIssue { return { path: context.path, code, message, phase: context.phase }; }
function appendIssue(target: ValidationIssue[], result: string | ValidationIssue | void, path: string, phase: ValidationContext['phase'], code: string): void { if (!result) return; target.push(typeof result === 'string' ? { path, code, message: result, phase } : { ...result, path: result.path || path, phase: result.phase ?? phase }); }
function joinPath(base: string, segment: string): string { return base ? `${base}.${segment}` : segment; }
function isFileLike(value: unknown): value is FileLike { return Boolean(value && typeof value === 'object' && typeof (value as FileLike).name === 'string' && typeof (value as FileLike).size === 'number' && typeof (value as FileLike).type === 'string'); }
function customResult<T>(result: T | string | ValidationIssue, context: ValidationContext): ValidationResult<T> { if (typeof result === 'string') return { success: false, issues: [{ path: context.path, code: 'custom', message: result, phase: context.phase }] }; if (result && typeof result === 'object' && 'message' in result && 'code' in result) return { success: false, issues: [{ ...(result as ValidationIssue), path: (result as ValidationIssue).path || context.path }] }; return { success: true, value: result as T, issues: [] }; }
