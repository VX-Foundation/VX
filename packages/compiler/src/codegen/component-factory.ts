/**
 * Emits lifecycle factories for visual and headless VX modules. Factories use
 * explicit ownership and idempotent cleanup; nested visual components remain
 * wrapper-free and are tracked through private node boundaries.
 */
import type { ComponentContract, VisualProgramIR } from '@vx/types';

/** Emits the lifecycle factory used by headless VX modules. */
export function generateHeadlessFactory(contract: ComponentContract): string {
  const exports = contract.exports
    .map((item) => `${JSON.stringify(item.name)}: ctx[${JSON.stringify(item.name)}]`)
    .join(', ');
  return `export function createHeadlessModule(runtime = {}) {\n` +
    `  const ctx = setup({}, runtime, {}, null);\n` +
    `  mountComponentScope(ctx.__vxComponentScope);\n` +
    `  for (const hook of ctx.__vxMount) hook();\n` +
    `  for (const hook of ctx.__vxUpdate) ctx.__vxCleanup.push(() => hook.dispose());\n` +
    `  let active = true;\n` +
    `  return {\n` +
    `    exports: Object.freeze({ ${exports} }),\n` +
    `    dispose() {\n` +
    `      if (!active) return;\n` +
    `      active = false;\n` +
    `      for (const hook of [...ctx.__vxUnmount].reverse()) hook();\n` +
    `      __vxRunCleanup(ctx.__vxCleanup);\n` +
    `    }\n` +
    `  };\n` +
    `}\n`;
}

/** Emits a wrapper-free nested component factory with explicit node boundaries. */
export function generateComponentFactory(hasView: boolean, visual?: VisualProgramIR): string {
  const install = styleInstallation(visual);
  return `export function createComponent(props = {}, runtime = {}, outputs = {}, content = {}, parts = {}, options = {}) {\n` +
    `  const ctx = setup(props, runtime, outputs, options.parentScope ?? null);\n` +
    install +
    `  const start = document.createComment('vx:component:start');\n` +
    `  const end = document.createComment('vx:component:end');\n` +
    `  const node = document.createDocumentFragment();\n` +
    `  node.appendChild(start);\n` +
    (hasView ? `  node.appendChild(template(ctx, content, parts, options.forwarded ?? {}));\n` : '') +
    `  node.appendChild(end);\n` +
    `  const handle = createComponentHandle(start, end);\n` +
    `  let __vxRefCleanup = () => {};\n` +
    `  ctx.__vxCleanup.push(onComponentScopeMount(ctx.__vxComponentScope, () => { __vxRefCleanup = assignComponentRef(options.ref, handle); }));\n` +
    `  ctx.__vxCleanup.push(() => __vxRefCleanup());\n` +
    `  for (const hook of ctx.__vxUpdate) ctx.__vxCleanup.push(() => hook.dispose());\n` +
    `  let active = true;\n` +
    `  let mounted = false;\n` +
    `  const dispose = () => {\n` +
    `    if (!active) return;\n` +
    `    active = false;\n` +
    `    if (mounted) for (const hook of [...ctx.__vxUnmount].reverse()) hook();\n` +
    `    __vxRunCleanup(ctx.__vxCleanup);\n` +
    `    removeComponentRange(start, end);\n` +
    `  };\n` +
    `  const mount = () => {\n` +
    `    if (!active || mounted) return;\n` +
    `    try {\n` +
    `      mountComponentScope(ctx.__vxComponentScope);\n` +
    `      for (const hook of ctx.__vxMount) hook();\n` +
    `      mounted = true;\n` +
    `    } catch (error) {\n` +
    `      dispose();\n` +
    `      throw error;\n` +
    `    }\n` +
    `  };\n` +
    `  return { node, ctx, handle, mount, dispose };\n` +
    `}\n\n`;
}

/** Emits the root application mount without exposing internal boundary comments. */
export function generateApplicationMount(visual?: VisualProgramIR): string {
  const install = styleInstallation(visual);
  return `export default function mountApp(rootElement, props = {}, runtime = {}) {\n` +
    `  if (!(rootElement instanceof Element)) throw new TypeError('VX mount target must be a DOM Element.');\n` +
    `  const ctx = setup(props, runtime, {}, null);\n` +
    install +
    `  rootElement.replaceChildren(template(ctx, {}, {}, {}));\n` +
    `  for (const hook of ctx.__vxUpdate) ctx.__vxCleanup.push(() => hook.dispose());\n` +
    `  let active = true;\n` +
    `  let mounted = false;\n` +
    `  const dispose = () => {\n` +
    `    if (!active) return;\n` +
    `    active = false;\n` +
    `    if (mounted) for (const hook of [...ctx.__vxUnmount].reverse()) hook();\n` +
    `    __vxRunCleanup(ctx.__vxCleanup);\n` +
    `    rootElement.replaceChildren();\n` +
    `  };\n` +
    `  try {\n` +
    `    mountComponentScope(ctx.__vxComponentScope);\n` +
    `    for (const hook of ctx.__vxMount) hook();\n` +
    `    mounted = true;\n` +
    `  } catch (error) {\n` +
    `    dispose();\n` +
    `    throw error;\n` +
    `  }\n` +
    `  return dispose;\n` +
    `}\n`;
}

function styleInstallation(visual?: VisualProgramIR): string {
  return visual?.cssText
    ? `  ctx.__vxCleanup.push(installStyles(${JSON.stringify(visual.scopeId)}, ${JSON.stringify(visual.cssText)}));\n`
    : '';
}
