# @vx-foundation/benchmark

Framework-neutral benchmark protocol, statistics, fairness rules, budgets, and reports for VX public performance comparisons.

Current package line: `0.1.2`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./protocol` -> `./dist/protocol.d.ts`
- `./report` -> `./dist/report.d.ts`
- `./runner` -> `./dist/runner.d.ts`
- `./statistics` -> `./dist/statistics.d.ts`

## Exported symbols

- `ALL_FRAMEWORKS` - const in `protocol.ts`
- `ALL_SCENARIOS` - const in `protocol.ts`
- `BenchmarkAdapter` - interface in `protocol.ts`
- `BenchmarkEnvironment` - interface in `protocol.ts`
- `BenchmarkEvidence` - interface in `protocol.ts`
- `BenchmarkFramework` - type in `protocol.ts`
- `BenchmarkMetric` - type in `protocol.ts`
- `BenchmarkResult` - interface in `protocol.ts`
- `BenchmarkSample` - interface in `protocol.ts`
- `BenchmarkScenario` - type in `protocol.ts`
- `BenchmarkStatistics` - interface in `statistics.ts`
- `compareFrameworkResults` - function in `report.ts`
- `FrameworkIdentity` - interface in `protocol.ts`
- `relativeDifference` - function in `statistics.ts`
- `renderMarkdownReport` - function in `report.ts`
- `ScenarioComparison` - interface in `report.ts`
- `summarizeSamples` - function in `statistics.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
