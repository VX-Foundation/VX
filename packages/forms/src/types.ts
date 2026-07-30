export type FormPath = string;
export type ValidationPhase = 'input' | 'blur' | 'submit' | 'server';

export interface ValidationIssue {
  path: FormPath;
  code: string;
  message: string;
  phase?: ValidationPhase;
  meta?: Readonly<Record<string, unknown>>;
}

export interface ValidationContext {
  phase: ValidationPhase;
  signal?: AbortSignal;
  root: unknown;
  path: FormPath;
}

export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export interface Schema<T = unknown> {
  readonly kind: string;
  readonly optional: boolean;
  parse(input: unknown, context?: Partial<ValidationContext>): ValidationResult<T>;
  parseAsync(input: unknown, context?: Partial<ValidationContext>): Promise<ValidationResult<T>>;
  describe(): SchemaDescription;
}

export interface SchemaDescription {
  kind: string;
  optional: boolean;
  rules?: readonly Readonly<Record<string, unknown>>[];
  fields?: Readonly<Record<string, SchemaDescription>>;
  item?: SchemaDescription;
}

export interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified?: number;
  stream?: () => ReadableStream<Uint8Array>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export type FormStatus = 'idle' | 'validating' | 'submitting' | 'success' | 'failure';

export interface FieldSnapshot<T = unknown> {
  path: FormPath;
  value: T;
  initialValue: T;
  dirty: boolean;
  touched: boolean;
  visited: boolean;
  pending: boolean;
  valid: boolean;
  errors: readonly ValidationIssue[];
}

export interface FormSnapshot<T> {
  values: T;
  initialValues: T;
  status: FormStatus;
  dirty: boolean;
  touched: boolean;
  valid: boolean;
  pending: boolean;
  submitted: boolean;
  submitCount: number;
  activeStep: string | null;
  errors: readonly ValidationIssue[];
  result?: unknown;
}

export interface FormSubmissionSuccess<R = unknown> {
  ok: true;
  status: number;
  data?: R;
  redirect?: string;
  reset?: boolean;
}

export interface FormSubmissionFailure {
  ok: false;
  status: number;
  formError?: string;
  fieldErrors: ValidationIssue[];
}

export type FormSubmissionResult<R = unknown> = FormSubmissionSuccess<R> | FormSubmissionFailure;

export interface SubmitContext<T> {
  values: T;
  signal: AbortSignal;
  optimistic<TSnapshot>(apply: () => TSnapshot, rollback: (snapshot: TSnapshot) => void): TSnapshot;
  reportProgress(loaded: number, total?: number): void;
}

export interface FormHydrationState<T> {
  values: T;
  fieldErrors?: readonly ValidationIssue[];
  formError?: string;
  submitted?: boolean;
  submitCount?: number;
}

export interface FormControllerOptions<T, R = unknown> {
  id?: string;
  schema: Schema<T>;
  initialValues: T;
  state?: FormHydrationState<T>;
  action?: string;
  method?: 'post' | 'put' | 'patch';
  enhance?: boolean;
  focusErrors?: boolean;
  validateOn?: readonly ValidationPhase[];
  steps?: Readonly<Record<string, readonly FormPath[]>>;
  submit?: (context: SubmitContext<T>) => Promise<FormSubmissionResult<R>> | FormSubmissionResult<R>;
  resetOnSuccess?: boolean;
}
