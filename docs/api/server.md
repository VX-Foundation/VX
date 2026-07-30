# @vx/server

VX production server platform with request context, sessions, middleware, security, observability, and Node adapters.

Current package line: `0.1.0`.

## Public entries

- `.` → `./dist/index.d.ts`
- `./cookies` → `./dist/cookies.d.ts`
- `./middleware` → `./dist/middleware.d.ts`
- `./node` → `./dist/node.d.ts`
- `./observability` → `./dist/observability.d.ts`
- `./security` → `./dist/security.d.ts`
- `./sessions` → `./dist/sessions.d.ts`

## Exported symbols

- `applyCors` — function in `security.ts`
- `applySecurityHeaders` — function in `security.ts`
- `AuthorizationPolicy` — interface in `authorization.ts`
- `Awaitable` — type in `types.ts`
- `BodyLimits` — interface in `body.ts`
- `composeServerMiddleware` — function in `middleware.ts`
- `CookieJar` — class in `cookies.ts`
- `CookieOptions` — interface in `cookies.ts`
- `CookiePriority` — type in `cookies.ts`
- `CorsOptions` — interface in `security.ts`
- `createLogger` — function in `observability.ts`
- `createMemoryRateLimiter` — function in `rate-limit.ts`
- `createRouteEndpointHandler` — function in `endpoints.ts`
- `createServerApplication` — function in `application.ts`
- `createServerPlatform` — function in `platform.ts`
- `createSessionManager` — function in `sessions.ts`
- `createStaticFileHandler` — function in `node.ts`
- `createTrace` — function in `observability.ts`
- `currentServerContext` — function in `context.ts`
- `DefinedEndpoint` — interface in `endpoints.ts`
- `defineEndpoint` — function in `endpoints.ts`
- `EndpointCodec` — interface in `endpoints.ts`
- `EndpointContract` — interface in `endpoints.ts`
- `EndpointInvocation` — interface in `endpoints.ts`
- `EndpointRouteContext` — interface in `endpoints.ts`
- `EndpointRouteHandler` — type in `endpoints.ts`
- `env` — const in `environment.ts`
- `EnvironmentField` — interface in `environment.ts`
- `EnvironmentParser` — type in `environment.ts`
- `EnvironmentSchema` — type in `environment.ts`
- `FetchApplication` — interface in `node.ts`
- `json` — function in `responses.ts`
- `JsonResponseOptions` — interface in `responses.ts`
- `LoggerOptions` — interface in `observability.ts`
- `MemoryRateLimiterOptions` — interface in `rate-limit.ts`
- `MemorySessionStore` — class in `sessions.ts`
- `noContent` — function in `responses.ts`
- `NodeServerOptions` — interface in `node.ts`
- `optionalServerContext` — function in `context.ts`
- `ParsedEnvironment` — type in `environment.ts`
- `ParsedRequestBody` — type in `body.ts`
- `RateLimitDecision` — interface in `rate-limit.ts`
- `RateLimiter` — interface in `rate-limit.ts`
- `rateLimitKeyFromRequest` — function in `rate-limit.ts`
- `readServerEnvironment` — function in `environment.ts`
- `redirect` — function in `responses.ts`
- `requireAuthorization` — function in `authorization.ts`
- `ResolvedSession` — interface in `sessions.ts`
- `RunningNodeServer` — interface in `node.ts`
- `runWithServerContext` — function in `context.ts`
- `SameSite` — type in `cookies.ts`
- `SecurityHeadersOptions` — interface in `security.ts`
- `serializeCookie` — function in `cookies.ts`
- `ServerErrorContext` — interface in `types.ts`
- `ServerErrorResult` — interface in `types.ts`
- `ServerHandler` — interface in `types.ts`
- `ServerLogger` — interface in `types.ts`
- `ServerLogRecord` — interface in `types.ts`
- `ServerMiddleware` — interface in `types.ts`
- `ServerPlatformApplication` — interface in `platform.ts`
- `ServerPlatformOptions` — interface in `platform.ts`
- `ServerPrincipal` — interface in `types.ts`
- `ServerRequestContext` — interface in `types.ts`
- `ServerSession` — interface in `types.ts`
- `ServerSpan` — interface in `types.ts`
- `ServerTrace` — interface in `types.ts`
- `ServerTraceAttribute` — type in `types.ts`
- `ServerTraceAttributeValue` — type in `types.ts`
- `ServerWaitUntil` — interface in `types.ts`
- `SessionManager` — interface in `sessions.ts`
- `SessionManagerOptions` — interface in `sessions.ts`
- `SessionRecord` — interface in `sessions.ts`
- `SessionStore` — interface in `sessions.ts`
- `StaticFileHandlerOptions` — interface in `node.ts`
- `stream` — function in `responses.ts`
- `text` — function in `responses.ts`
- `toWebRequest` — function in `node.ts`
- `VXServerApplication` — interface in `application.ts`
- `VXServerApplicationOptions` — interface in `application.ts`
- `withTimeout` — function in `middleware.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
