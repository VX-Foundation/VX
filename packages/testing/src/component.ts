export interface MountedComponent<TProps, TState> {
  root: Element;
  update?(props: TProps): void | Promise<void>;
  state?(): TState;
  dispose?(): void | Promise<void>;
}

export interface ComponentTestHarness<TProps, TState> {
  root: Element;
  update(props: TProps): Promise<void>;
  state(): TState | undefined;
  dispose(): Promise<void>;
}

export async function mountComponent<TProps, TState>(
  host: Element,
  props: TProps,
  mount: (host: Element, props: TProps) => MountedComponent<TProps, TState> | Promise<MountedComponent<TProps, TState>>
): Promise<ComponentTestHarness<TProps, TState>> {
  const mounted = await mount(host, props);
  let disposed = false;
  return {
    root: mounted.root,
    async update(next) {
      if (disposed) throw new Error('The VX component test harness has already been disposed.');
      await mounted.update?.(next);
    },
    state() {
      if (disposed) throw new Error('The VX component test harness has already been disposed.');
      return mounted.state?.();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await mounted.dispose?.();
      if (mounted.root.parentNode === host) host.removeChild(mounted.root);
    }
  };
}
