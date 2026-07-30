/** Interruptible element, structural, route, and shared-element transitions. */

import type { ResourceOwner } from './ownership.js';

export type TransitionPhase = 'enter' | 'exit' | 'update';
export type TransitionState = 'idle' | 'running' | 'finished' | 'cancelled';

export interface TransitionDefinition {
  name?: string;
  duration?: number;
  delay?: number;
  easing?: string;
  fill?: FillMode;
  enter?: Keyframe[] | PropertyIndexedKeyframes;
  exit?: Keyframe[] | PropertyIndexedKeyframes;
  update?: Keyframe[] | PropertyIndexedKeyframes;
}

export type TransitionInput = string | TransitionDefinition | null | undefined | false;

export interface TransitionController {
  readonly state: TransitionState;
  readonly phase: TransitionPhase;
  readonly finished: Promise<void>;
  cancel(): void;
  reverse(): boolean;
}

export interface RouteTransitionOptions {
  name?: string;
  types?: readonly string[];
  skip?: boolean;
  signal?: AbortSignal;
  document?: Document;
}

export interface SharedElement {
  element: HTMLElement;
  name: string;
}

interface ActiveTransition {
  phase: TransitionPhase;
  name: string;
  animation: Animation;
  controller: TransitionController;
}

const activeTransitions = new WeakMap<Element, ActiveTransition>();
const DEFAULT_DURATION = 180;

export function transitionElement(
  element: Element,
  phase: TransitionPhase,
  input: TransitionInput,
  owner?: ResourceOwner
): TransitionController {
  const definition = resolveTransition(input);
  if (!definition || definition.name === 'none' || definition.duration === 0 || prefersReducedMotion() || typeof element.animate !== 'function') {
    return completedController(phase);
  }
  const existing = activeTransitions.get(element);
  if (existing) {
    if (existing.name === definition.name && isOpposite(existing.phase, phase) && existing.controller.reverse()) {
      return existing.controller;
    }
    existing.controller.cancel();
  }

  const animation = element.animate(framesFor(definition, phase), {
    duration: definition.duration,
    delay: definition.delay,
    easing: definition.easing,
    fill: definition.fill
  });
  let state: TransitionState = 'running';
  let currentPhase = phase;
  let resolveFinished = (): void => undefined;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const controller: TransitionController = {
    get state() { return state; },
    get phase() { return currentPhase; },
    finished,
    cancel() {
      if (state !== 'running') return;
      state = 'cancelled';
      animation.cancel();
      if (activeTransitions.get(element)?.controller === controller) activeTransitions.delete(element);
      resolveFinished();
    },
    reverse() {
      if (state !== 'running' || typeof animation.reverse !== 'function') return false;
      animation.reverse();
      currentPhase = currentPhase === 'enter' ? 'exit' : currentPhase === 'exit' ? 'enter' : currentPhase;
      const active = activeTransitions.get(element);
      if (active?.controller === controller) active.phase = currentPhase;
      return true;
    }
  };
  activeTransitions.set(element, { phase, name: definition.name, animation, controller });
  element.setAttribute('data-vx-transition', definition.name);
  void animation.finished.then(
    () => {
      if (state !== 'running') return;
      state = 'finished';
      if (activeTransitions.get(element)?.controller === controller) activeTransitions.delete(element);
      resolveFinished();
    },
    () => {
      if (state !== 'running') return;
      state = 'cancelled';
      if (activeTransitions.get(element)?.controller === controller) activeTransitions.delete(element);
      resolveFinished();
    }
  );
  owner?.own(() => controller.cancel(), `transition:${definition.name}`);
  return controller;
}

export function transitionElements(
  elements: Iterable<Element>,
  phase: TransitionPhase,
  input: TransitionInput,
  owner?: ResourceOwner
): TransitionController {
  const controllers = [...elements].map((element) => transitionElement(element, phase, input, owner));
  let state: TransitionState = controllers.some((controller) => controller.state === 'running') ? 'running' : 'finished';
  const finished = Promise.all(controllers.map((controller) => controller.finished)).then(() => { if (state === 'running') state = 'finished'; });
  return {
    get state() { return state; },
    get phase() { return controllers[0]?.phase ?? phase; },
    finished,
    cancel() {
      if (state !== 'running') return;
      state = 'cancelled';
      for (const controller of controllers) controller.cancel();
    },
    reverse() {
      let reversed = false;
      for (const controller of controllers) reversed = controller.reverse() || reversed;
      return reversed;
    }
  };
}

export async function runRouteTransition<T>(update: () => T | Promise<T>, options: RouteTransitionOptions = {}): Promise<T> {
  throwIfAborted(options.signal);
  const documentTarget = options.document ?? (typeof document !== 'undefined' ? document : undefined);
  if (options.skip || prefersReducedMotion() || !documentTarget) return await update();
  const compatibleDocument = documentTarget as Document & {
    startViewTransition?: (callback: () => void | Promise<void>) => {
      finished: Promise<void>;
      updateCallbackDone: Promise<void>;
      skipTransition(): void;
    };
  };
  if (typeof compatibleDocument.startViewTransition !== 'function') return await update();
  let result!: T;
  let failure: unknown;
  if (options.name) compatibleDocument.documentElement.dataset['vxRouteTransition'] = options.name;
  if (options.types?.length) compatibleDocument.documentElement.dataset['vxRouteTransitionTypes'] = options.types.join(' ');
  const transition = compatibleDocument.startViewTransition(async () => {
    try {
      throwIfAborted(options.signal);
      result = await update();
    } catch (error) {
      failure = error;
    }
  });
  const abort = (): void => transition.skipTransition();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    await transition.updateCallbackDone;
    await transition.finished.catch(() => undefined);
  } finally {
    options.signal?.removeEventListener('abort', abort);
    delete compatibleDocument.documentElement.dataset['vxRouteTransition'];
    delete compatibleDocument.documentElement.dataset['vxRouteTransitionTypes'];
  }
  if (failure !== undefined) throw failure;
  return result;
}

export async function runSharedElementTransition<T>(
  shared: readonly SharedElement[],
  update: () => T | Promise<T>,
  options: RouteTransitionOptions = {}
): Promise<T> {
  const previous = shared.map(({ element }) => element.style.viewTransitionName);
  for (const { element, name } of shared) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) throw new TypeError(`Invalid VX shared-element transition name '${name}'.`);
    element.style.viewTransitionName = name;
  }
  try {
    return await runRouteTransition(update, options);
  } finally {
    shared.forEach(({ element }, index) => { element.style.viewTransitionName = previous[index] ?? ''; });
  }
}

export function cancelElementTransition(element: Element): void {
  activeTransitions.get(element)?.controller.cancel();
}

export function normalizeTransition(input: TransitionInput): Required<Omit<TransitionDefinition, 'enter' | 'exit' | 'update'>> & Pick<TransitionDefinition, 'enter' | 'exit' | 'update'> | undefined {
  return resolveTransition(input);
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolveTransition(input: TransitionInput): (Required<Omit<TransitionDefinition, 'enter' | 'exit' | 'update'>> & Pick<TransitionDefinition, 'enter' | 'exit' | 'update'>) | undefined {
  if (!input) return undefined;
  const definition = typeof input === 'string' ? { name: input } : input;
  const duration = finiteNonNegative(definition.duration ?? DEFAULT_DURATION, 'duration');
  const delay = finiteNonNegative(definition.delay ?? 0, 'delay');
  return {
    name: definition.name ?? 'fade',
    duration,
    delay,
    easing: definition.easing ?? 'cubic-bezier(.2,0,0,1)',
    fill: definition.fill ?? 'both',
    ...(definition.enter ? { enter: definition.enter } : {}),
    ...(definition.exit ? { exit: definition.exit } : {}),
    ...(definition.update ? { update: definition.update } : {})
  };
}

function framesFor(definition: ReturnType<typeof resolveTransition> & {}, phase: TransitionPhase): Keyframe[] | PropertyIndexedKeyframes {
  const custom = definition[phase];
  if (custom) return custom;
  const entering = phase === 'enter';
  switch (definition.name) {
    case 'slide':
      return entering
        ? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }]
        : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }];
    case 'scale':
      return entering
        ? [{ opacity: 0, transform: 'scale(.975)' }, { opacity: 1, transform: 'scale(1)' }]
        : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.975)' }];
    case 'update':
      return [{ opacity: .72 }, { opacity: 1 }];
    default:
      return entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
  }
}

function completedController(phase: TransitionPhase): TransitionController {
  return Object.freeze({ state: 'finished' as const, phase, finished: Promise.resolve(), cancel() {}, reverse() { return false; } });
}

function isOpposite(left: TransitionPhase, right: TransitionPhase): boolean {
  return (left === 'enter' && right === 'exit') || (left === 'exit' && right === 'enter');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('VX transition cancelled.', 'AbortError');
}

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`VX transition ${name} must be a finite non-negative number.`);
  return value;
}
