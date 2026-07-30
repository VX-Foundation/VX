import { cloneValue, deletePath, getPath, setPath } from './path.js';
import type {
  FieldSnapshot,
  FormControllerOptions,
  FormPath,
  FormSnapshot,
  FormStatus,
  FormSubmissionResult,
  SubmitContext,
  ValidationIssue,
  ValidationPhase
} from './types.js';

type Listener<T> = (snapshot: FormSnapshot<T>) => void;
type FieldListener = (snapshot: FieldSnapshot) => void;

interface FieldMeta {
  touched: boolean;
  visited: boolean;
  pending: boolean;
  errors: ValidationIssue[];
}

export class FormController<T extends Record<string, unknown>, R = unknown> {
  private values: T;
  private initialValues: T;
  private status: FormStatus = 'idle';
  private submitted = false;
  private submitCount = 0;
  private result: unknown;
  private activeStep: string | null;
  private issues: ValidationIssue[] = [];
  private readonly fields = new Map<FormPath, FieldMeta>();
  private readonly listeners = new Set<Listener<T>>();
  private readonly fieldListeners = new Map<FormPath, Set<FieldListener>>();
  private submitController: AbortController | null = null;
  private validateController: AbortController | null = null;
  private optimisticRollbacks: (() => void)[] = [];

  constructor(private readonly options: FormControllerOptions<T, R>) {
    this.initialValues = cloneValue(options.initialValues);
    this.values = cloneValue(options.state?.values ?? options.initialValues);
    this.activeStep = Object.keys(options.steps ?? {})[0] ?? null;
    if (options.state) {
      this.submitted = options.state.submitted ?? true;
      this.submitCount = options.state.submitCount ?? 1;
      this.status = 'failure';
      this.result = options.state.formError;
      this.applyIssues((options.state.fieldErrors ?? []).map((issue) => ({ ...issue, phase: 'server' })));
      for (const issue of options.state.fieldErrors ?? []) this.ensureField(issue.path).touched = true;
    }
  }

  get config(): Readonly<Pick<FormControllerOptions<T, R>, 'id' | 'action' | 'method' | 'enhance' | 'focusErrors'>> {
    return Object.freeze({
      ...(this.options.id ? { id: this.options.id } : {}),
      ...(this.options.action ? { action: this.options.action } : {}),
      ...(this.options.method ? { method: this.options.method } : {}),
      ...(this.options.enhance !== undefined ? { enhance: this.options.enhance } : {}),
      ...(this.options.focusErrors !== undefined ? { focusErrors: this.options.focusErrors } : {})
    });
  }

  get snapshot(): FormSnapshot<T> {
    const dirty = !deepEqual(this.values, this.initialValues);
    const touched = Array.from(this.fields.values()).some((field) => field.touched);
    const pending = this.status === 'validating' || this.status === 'submitting' || Array.from(this.fields.values()).some((field) => field.pending);
    const snapshot: FormSnapshot<T> = {
      values: cloneValue(this.values),
      initialValues: cloneValue(this.initialValues),
      status: this.status,
      dirty,
      touched,
      valid: this.issues.length === 0,
      pending,
      submitted: this.submitted,
      submitCount: this.submitCount,
      activeStep: this.activeStep,
      errors: [...this.issues]
    };
    if (this.result !== undefined) snapshot.result = this.result;
    return snapshot;
  }

  field(path: FormPath): FieldSnapshot {
    const meta = this.ensureField(path);
    const value = getPath(this.values, path);
    const initialValue = getPath(this.initialValues, path);
    return {
      path,
      value,
      initialValue,
      dirty: !deepEqual(value, initialValue),
      touched: meta.touched,
      visited: meta.visited,
      pending: meta.pending,
      valid: meta.errors.length === 0,
      errors: [...meta.errors]
    };
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  subscribeField(path: FormPath, listener: FieldListener): () => void {
    const listeners = this.fieldListeners.get(path) ?? new Set<FieldListener>();
    listeners.add(listener);
    this.fieldListeners.set(path, listeners);
    listener(this.field(path));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.fieldListeners.delete(path);
    };
  }

  getValue(path: FormPath): unknown { return getPath(this.values, path); }

  setValue(path: FormPath, value: unknown, options: { touch?: boolean; validate?: boolean } = {}): void {
    this.values = setPath(this.values, path, value);
    const meta = this.ensureField(path);
    if (options.touch) meta.touched = true;
    this.clearFieldErrors(path);
    this.emit(path);
    if (options.validate ?? this.shouldValidate('input')) void this.validateField(path, 'input');
  }

  remove(path: FormPath): void {
    this.values = deletePath(this.values, path);
    this.fields.delete(path);
    this.issues = this.issues.filter((issue) => issue.path !== path && !issue.path.startsWith(`${path}.`));
    this.emit();
  }

  append(path: FormPath, value: unknown): void {
    const current = this.getValue(path);
    if (!Array.isArray(current)) throw new TypeError(`Form field '${path}' is not an array.`);
    this.setValue(path, [...current, value]);
  }

  insert(path: FormPath, index: number, value: unknown): void {
    const current = this.getValue(path);
    if (!Array.isArray(current)) throw new TypeError(`Form field '${path}' is not an array.`);
    const next = [...current];
    next.splice(index, 0, value);
    this.setValue(path, next);
  }

  move(path: FormPath, from: number, to: number): void {
    const current = this.getValue(path);
    if (!Array.isArray(current)) throw new TypeError(`Form field '${path}' is not an array.`);
    if (from < 0 || from >= current.length || to < 0 || to >= current.length) throw new RangeError('Array field move index is out of range.');
    const next = [...current];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    this.setValue(path, next);
  }

  focus(path: FormPath): void {
    const meta = this.ensureField(path);
    meta.visited = true;
    this.emit(path);
  }

  blur(path: FormPath): void {
    const meta = this.ensureField(path);
    meta.touched = true;
    this.emit(path);
    if (this.shouldValidate('blur')) void this.validateField(path, 'blur');
  }

  setStep(step: string): void {
    if (!this.options.steps?.[step]) throw new TypeError(`Unknown form step '${step}'.`);
    this.activeStep = step;
    this.emit();
  }

  async nextStep(): Promise<boolean> {
    const names = Object.keys(this.options.steps ?? {});
    if (!this.activeStep || names.length === 0) return true;
    const paths = this.options.steps?.[this.activeStep] ?? [];
    const valid = await this.validatePaths(paths, 'submit');
    if (!valid) return false;
    const index = names.indexOf(this.activeStep);
    if (index >= 0 && index < names.length - 1) this.activeStep = names[index + 1]!;
    this.emit();
    return true;
  }

  previousStep(): void {
    const names = Object.keys(this.options.steps ?? {});
    if (!this.activeStep) return;
    const index = names.indexOf(this.activeStep);
    if (index > 0) this.activeStep = names[index - 1]!;
    this.emit();
  }

  async validate(phase: ValidationPhase = 'submit'): Promise<boolean> {
    this.validateController?.abort();
    const controller = new AbortController();
    this.validateController = controller;
    this.status = 'validating';
    this.markPending('', true);
    this.emit();
    try {
      const result = await this.options.schema.parseAsync(this.values, { phase, root: this.values, signal: controller.signal });
      if (controller.signal.aborted) return false;
      this.applyIssues(result.issues);
      this.status = result.success ? 'idle' : 'failure';
      return result.success;
    } finally {
      if (this.validateController === controller) this.validateController = null;
      this.markPending('', false);
      this.emit();
    }
  }

  async validateField(path: FormPath, phase: ValidationPhase = 'input'): Promise<boolean> {
    const result = await this.options.schema.parseAsync(this.values, { phase, root: this.values });
    const fieldIssues = result.issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
    this.clearFieldErrors(path);
    this.issues.push(...fieldIssues);
    this.rebuildFieldIssues();
    this.emit(path);
    return fieldIssues.length === 0;
  }

  async submit(): Promise<FormSubmissionResult<R>> {
    this.submitController?.abort();
    const controller = new AbortController();
    this.submitController = controller;
    this.submitted = true;
    this.submitCount += 1;
    this.status = 'validating';
    this.emit();

    const validation = await this.options.schema.parseAsync(this.values, { phase: 'submit', root: this.values, signal: controller.signal });
    if (controller.signal.aborted) return { ok: false, status: 499, formError: 'Submission cancelled.', fieldErrors: [] };
    this.applyIssues(validation.issues);
    if (!validation.success) {
      this.status = 'failure';
      this.emit();
      return { ok: false, status: 422, fieldErrors: validation.issues };
    }

    if (!this.options.submit) {
      this.status = 'success';
      this.emit();
      return { ok: true, status: 200, data: validation.value as unknown as R };
    }

    this.status = 'submitting';
    this.optimisticRollbacks = [];
    this.emit();
    const context: SubmitContext<T> = {
      values: cloneValue(validation.value as T),
      signal: controller.signal,
      optimistic: (apply, rollback) => {
        const snapshot = apply();
        this.optimisticRollbacks.push(() => rollback(snapshot));
        return snapshot;
      },
      reportProgress: (loaded, total) => {
        this.result = { progress: total && total > 0 ? loaded / total : undefined, loaded, total };
        this.emit();
      }
    };

    try {
      const result = await this.options.submit(context);
      if (controller.signal.aborted) return { ok: false, status: 499, formError: 'Submission cancelled.', fieldErrors: [] };
      this.result = result.ok ? result.data : result.formError;
      if (result.ok) {
        this.status = 'success';
        this.optimisticRollbacks = [];
        if (result.reset ?? this.options.resetOnSuccess) this.reset();
      } else {
        this.status = 'failure';
        this.applyIssues(result.fieldErrors);
        this.rollbackOptimistic();
      }
      this.emit();
      return result;
    } catch (error) {
      this.status = 'failure';
      this.rollbackOptimistic();
      const message = error instanceof Error ? error.message : 'Form submission failed.';
      this.result = message;
      this.emit();
      return { ok: false, status: 500, formError: message, fieldErrors: [] };
    } finally {
      if (this.submitController === controller) this.submitController = null;
    }
  }

  cancel(): void {
    this.validateController?.abort();
    this.submitController?.abort();
    this.rollbackOptimistic();
    this.status = 'idle';
    this.emit();
  }

  reset(values: T = this.initialValues): void {
    this.values = cloneValue(values);
    this.initialValues = cloneValue(values);
    this.status = 'idle';
    this.submitted = false;
    this.result = undefined;
    this.issues = [];
    this.fields.clear();
    this.emit();
  }

  setServerErrors(issues: readonly ValidationIssue[], formError?: string): void {
    this.applyIssues(issues.map((issue) => ({ ...issue, phase: 'server' })));
    this.status = 'failure';
    this.result = formError;
    this.emit();
  }

  private shouldValidate(phase: ValidationPhase): boolean { return (this.options.validateOn ?? ['blur', 'submit']).includes(phase); }
  private ensureField(path: FormPath): FieldMeta { const current = this.fields.get(path); if (current) return current; const created = { touched: false, visited: false, pending: false, errors: [] }; this.fields.set(path, created); return created; }
  private clearFieldErrors(path: FormPath): void { this.issues = this.issues.filter((issue) => issue.path !== path && !issue.path.startsWith(`${path}.`)); this.rebuildFieldIssues(); }
  private applyIssues(issues: readonly ValidationIssue[]): void { this.issues = [...issues]; this.rebuildFieldIssues(); }
  private rebuildFieldIssues(): void { for (const meta of this.fields.values()) meta.errors = []; for (const issue of this.issues) this.ensureField(issue.path).errors.push(issue); }
  private markPending(path: FormPath, pending: boolean): void { if (path) this.ensureField(path).pending = pending; }
  private rollbackOptimistic(): void { for (const rollback of [...this.optimisticRollbacks].reverse()) rollback(); this.optimisticRollbacks = []; }
  private async validatePaths(paths: readonly FormPath[], phase: ValidationPhase): Promise<boolean> { const result = await this.options.schema.parseAsync(this.values, { phase, root: this.values }); const relevant = result.issues.filter((issue) => paths.some((path) => issue.path === path || issue.path.startsWith(`${path}.`))); this.issues = [...this.issues.filter((issue) => !paths.some((path) => issue.path === path || issue.path.startsWith(`${path}.`))), ...relevant]; this.rebuildFieldIssues(); this.emit(); return relevant.length === 0; }
  private emit(path?: FormPath): void { const snapshot = this.snapshot; for (const listener of this.listeners) listener(snapshot); if (path) for (const listener of this.fieldListeners.get(path) ?? []) listener(this.field(path)); }
}

export function createForm<T extends Record<string, unknown>, R = unknown>(options: FormControllerOptions<T, R>): FormController<T, R> {
  return new FormController(options);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left as Record<string, unknown>);
    const rightKeys = Object.keys(right as Record<string, unknown>);
    return leftEntries.length === rightKeys.length && leftEntries.every(([key, value]) => Object.hasOwn(right, key) && deepEqual(value, (right as Record<string, unknown>)[key]));
  }
  return false;
}
