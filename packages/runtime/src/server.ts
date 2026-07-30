export {
  registerServerAction,
  getServerAction,
  getServerActionContract,
  invokeServerAction,
  dispatchServerAction,
  serverActionRequest
} from './server-platform/actions.js';
export type {
  ServerActionHandler,
  ServerActionContract,
  ServerActionParameterContract,
  ServerActionAuthorization,
  ServerActionCsrfPolicy,
  DispatchServerActionOptions,
  ServerActionAuthorizationContext
} from './server-platform/actions.js';
export { createCsrfToken, verifyCsrfToken, csrfTokenFromRequest } from './server-platform/csrf.js';
export type { CsrfTokenOptions } from './server-platform/csrf.js';
export {
  createServerRenderContext,
  renderText,
  renderElement,
  renderAttribute,
  renderComment,
  renderStructuralRange,
  renderIsland,
  renderResumableBoundary,
  renderContent,
  renderCollection,
  renderDocument
} from './server-platform/render.js';
export type {
  HydrationMode,
  StreamingMode,
  IslandHydrationStrategy,
  HydrationIsland,
  ResumableBoundary,
  ServerRenderContext,
  ServerRenderContextOptions,
  ServerQueryResource,
  RenderDocumentOptions,
  RenderedDocument,
  ServerResourceHint,
  ServerStyleAsset
} from './server-platform/render.js';
export { serializeServerValue, deserializeServerValue, escapeScriptJson, DEFAULT_SERVER_SERIALIZATION_LIMITS } from './server-platform/serialization.js';
export type { SerializedEnvelope, ServerSerializationLimits } from './server-platform/serialization.js';
export { runWithServerRequest, currentServerRequest, optionalServerRequest } from './server-platform/request-context.js';
export type { ServerRequestContext } from './server-platform/request-context.js';
export { QueryClient, createQueryKey, hashQueryKey } from './query/index.js';
export { dehydrateQueryClient, hydrateQueryClient, serializeQueryState } from './query/serialization.js';
export type { QueryPolicy, QuerySource, QueryDescriptor, DehydratedQueryState, QueryDehydrateOptions } from './query/index.js';
export { StoreRegistry, defineStore, acquireStore } from './store/index.js';
export type { StoreLifetime, StoreDefinition, StoreFactoryContext } from './store/index.js';
export { createRequestRuntime } from './request-runtime.js';
export type { RequestRuntime, RequestRuntimeOptions } from './request-runtime.js';

export { selectPatternBranch, matchesPattern, matchViewPattern } from './dom.js';

export { sanitizeURLAttribute, isURLAttribute, secureExternalRelation } from './security/url.js';

export { createComponentScope, provideComponentContext, acquireComponentContext, disposeComponentScope } from './component.js';

export { createResourceOwner, runWithOwner, getCurrentOwner, onOwnerCleanup, createCleanupStack, disposeCleanupStack, enableLeakDetection, inspectRuntimeLeaks, reportRuntimeLeaks, assertNoRuntimeLeaks } from './ownership.js';
export type { ResourceCleanup, OwnedResourceSnapshot, ResourceOwnerSnapshot, LeakDiagnostic, LeakDetectionOptions, ResourceLease, ResourceOwner, CleanupStack } from './ownership.js';
