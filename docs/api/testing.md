# @vx-foundation/testing

Official VX unit, component, DOM, SSR, hydration, route, action, endpoint, visual, accessibility, and performance testing contracts.

Current package line: `0.2.0`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./accessibility` -> `./dist/accessibility.d.ts`
- `./browser` -> `./dist/browser.d.ts`
- `./component` -> `./dist/component.d.ts`
- `./dom` -> `./dist/dom.d.ts`
- `./performance` -> `./dist/performance.d.ts`
- `./routes` -> `./dist/routes.d.ts`
- `./runner` -> `./dist/runner.d.ts`
- `./ssr` -> `./dist/ssr.d.ts`
- `./visual` -> `./dist/visual.d.ts`

## Exported symbols

- `AccessibilityAudit` - interface in `accessibility.ts`
- `AccessibilityAuditOptions` - interface in `accessibility.ts`
- `AccessibilityIssue` - interface in `accessibility.ts`
- `accessibleName` - function in `dom.ts`
- `auditAccessibility` - function in `accessibility.ts`
- `BrowserDriver` - interface in `browser.ts`
- `BrowserScenario` - interface in `browser.ts`
- `BrowserScenarioResult` - interface in `browser.ts`
- `BrowserScreenshotOptions` - interface in `browser.ts`
- `compareHydrationMarkup` - function in `ssr.ts`
- `compareRgbaSnapshots` - function in `visual.ts`
- `ComponentTestHarness` - interface in `component.ts`
- `contrastRatio` - function in `accessibility.ts`
- `createDomHarness` - function in `dom.ts`
- `createRouteHarness` - function in `routes.ts`
- `createTestSuite` - function in `runner.ts`
- `DomHarness` - interface in `dom.ts`
- `enforcePerformanceBudget` - function in `performance.ts`
- `HydrationTestResult` - interface in `ssr.ts`
- `InvocationResult` - interface in `routes.ts`
- `MarkupMismatch` - interface in `ssr.ts`
- `MountedComponent` - interface in `component.ts`
- `OfficialTestCase` - interface in `types.ts`
- `OfficialTestKind` - type in `types.ts`
- `OfficialTestReport` - interface in `types.ts`
- `OfficialTestResult` - interface in `types.ts`
- `OfficialTestSuite` - interface in `runner.ts`
- `PerformanceBudget` - interface in `performance.ts`
- `PerformanceBudgetResult` - interface in `performance.ts`
- `PerformanceSample` - interface in `performance.ts`
- `PerformanceStatistics` - interface in `performance.ts`
- `queryByLabelText` - function in `dom.ts`
- `queryByRole` - function in `dom.ts`
- `RoleQueryOptions` - interface in `dom.ts`
- `RouteHarness` - interface in `routes.ts`
- `TestContext` - interface in `types.ts`
- `TestDiagnostic` - interface in `types.ts`
- `TestRunOptions` - interface in `types.ts`
- `VisualComparisonOptions` - interface in `visual.ts`
- `VisualComparisonResult` - interface in `visual.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
