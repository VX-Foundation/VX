import { schema, createForm } from 'file:///C:/Users/estev/Downloads/VX-0.1.0/packages/forms/dist/index.js';
import { registerServerForm, serverFormAttributes, serverFieldAttributes, serverFieldErrorAttributes, renderCsrfField, renderMethodOverride, renderErrorSummary } from 'file:///C:/Users/estev/Downloads/VX-0.1.0/packages/forms/dist/server.js';
import { registerServerAction, renderText, renderElement, renderComment, renderIsland, renderContent, renderCollection, renderStructuralRange, selectPatternBranch, acquireStore, createComponentScope, provideComponentContext, acquireComponentContext, disposeComponentScope, createCleanupStack, disposeCleanupStack } from 'file:///C:/Users/estev/Downloads/VX-0.1.0/packages/runtime/dist/server.js';

export const save = registerServerAction({"id":"vx:2ce4c1542ce4c154:save","name":"save","parameters":[{"name":"values","type":"Person","optional":false}],"returnType":"Any","authorization":"authenticated","csrf":"required"}, (values) => {
  return { ok: true, status: 200, data: values };
});

const Person = schema.object({ "name": schema.string().min((2)), "password": schema.string().min((8)).sensitive() });
export const personFormContract = registerServerForm({"id":"vx:2ce4c1542ce4c154:person","name":"person","schema":"Person","method":"POST","authorization":"public","csrf":"required"}, { schema: Person, method: "POST", authorization: "public", csrf: "required", action: ({ values }) => save(values) });

export async function setupServer(props = {}, context, content = {}, parentScope = null, forwarded = {}) {
  const __vxCleanup = createCleanupStack("vx:2ce4c1542ce4c154");
  const __vxComponentScope = createComponentScope(parentScope);
  __vxCleanup.push(() => disposeComponentScope(__vxComponentScope));
  let __vxDisposed = false;
  const __vxDispose = () => {
    if (__vxDisposed) return;
    __vxDisposed = true;
    disposeCleanupStack(__vxCleanup);
  };
  context.onCleanup(__vxDispose);
  const __vxPending = [];
  const __vxOwner = "vx:2ce4c1542ce4c154";
  const Self = renderComponent;
  const save = (...args) => { throw new Error('Server action save cannot execute during SSR rendering.'); };
  const person = createForm({ id: "vx:2ce4c1542ce4c154:person", schema: Person, initialValues: ({ name: "Ada", password: "" }), state: context.formStates?.["vx:2ce4c1542ce4c154:person"], action: "/_vx/form/vx%3A2ce4c1542ce4c154%3Aperson", method: "post", enhance: true, focusErrors: true, validateOn: ['blur', 'submit'], steps: undefined, resetOnSuccess: false, submit: async ({ values }) => save(values) });
  __vxCleanup.push(() => person.cancel());
  if (context.streaming === 'blocking' && __vxPending.length > 0) await Promise.all(__vxPending);
  return { Self, Person, save, person, __vxCleanup, __vxDispose, __vxPending, __vxRuntime: context.runtime, __vxContent: content, __vxComponentScope, __vxForwarded: forwarded };
}

async function __vxRenderView(ctx, context, content = {}) {
  let html = '';
  let __vx_children_0 = '';
  const __vx_attrs_1 = Object.create(null);
  const __vx_form_controller_2 = (ctx.person);
  Object.assign(__vx_attrs_1, serverFormAttributes(__vx_form_controller_2));
  __vx_children_0 += renderCsrfField(context.csrfToken) + renderMethodOverride(__vx_form_controller_2.config.method);
  let __vx_children_3 = '';
  const __vx_attrs_4 = Object.create(null);
  const __vx_field_path_5 = String(("name"));
  Object.assign(__vx_attrs_4, serverFieldAttributes(__vx_form_controller_2, __vx_field_path_5, "Input"));
  __vx_attrs_4["ariaLabel"] = ("Name");
  __vx_children_0 += renderElement("input", __vx_attrs_4, __vx_children_3, "vxv-401-1", "Input");
  let __vx_children_6 = '';
  const __vx_attrs_7 = Object.create(null);
  const __vx_field_path_8 = String(("name"));
  const __vx_field_error_9 = __vx_form_controller_2.field(__vx_field_path_8);
  Object.assign(__vx_attrs_7, serverFieldErrorAttributes(__vx_form_controller_2, __vx_field_path_8));
  if (__vx_field_error_9.errors.length > 0) __vx_children_6 += renderText(__vx_field_error_9.errors.map((issue) => issue.message).join(' ')); else __vx_attrs_7.hidden = true;
  __vx_children_0 += renderElement("span", __vx_attrs_7, __vx_children_6, "vxv-463-2", "FieldError");
  let __vx_children_10 = '';
  const __vx_attrs_11 = Object.create(null);
  const __vx_field_path_12 = String(("password"));
  Object.assign(__vx_attrs_11, serverFieldAttributes(__vx_form_controller_2, __vx_field_path_12, "Input"));
  __vx_attrs_11["type"] = ("password");
  __vx_attrs_11["ariaLabel"] = ("Password");
  __vx_children_0 += renderElement("input", __vx_attrs_11, __vx_children_10, "vxv-496-3", "Input");
  let __vx_children_13 = '';
  const __vx_attrs_14 = Object.create(null);
  const __vx_form_controller_15 = (ctx.person);
  if (__vx_form_controller_15.snapshot.errors.length > 0) { __vx_attrs_14.role = __vx_attrs_14.role ?? 'alert'; __vx_children_13 += renderErrorSummary(__vx_form_controller_15); } else __vx_attrs_14.hidden = true;
  __vx_children_0 += renderElement("div", __vx_attrs_14, __vx_children_13, "vxv-589-4", "ErrorSummary");
  html += renderElement("form", __vx_attrs_1, __vx_children_0, "vxv-367-0", "Form");
  return html;
}

export const __vxComponent = Object.freeze({ id: "vx:2ce4c1542ce4c154", interactive: true });
export async function renderComponent(props = {}, context, content = {}, parentScope = null, forwarded = {}) {
  if (!context) throw new TypeError('VX server rendering requires a ServerRenderContext.');
  const ctx = await setupServer(props, context, content, parentScope, forwarded);
  const html = await __vxRenderView(ctx, context, content);
  return context.hydration === 'islands' ? renderIsland(context, "vx:2ce4c1542ce4c154", props, html) : html;
}
