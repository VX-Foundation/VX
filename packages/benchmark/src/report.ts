import type { BenchmarkFramework, BenchmarkResult, BenchmarkScenario } from './protocol.js';
import { relativeDifference, summarizeSamples } from './statistics.js';

export interface ScenarioComparison {
  scenario: BenchmarkScenario;
  metric: string;
  winner: BenchmarkFramework;
  rows: readonly {
    framework: BenchmarkFramework;
    version: string;
    median: number;
    p95: number;
    relativeToVX: number;
  }[];
}

export function compareFrameworkResults(results: readonly BenchmarkResult[]): readonly ScenarioComparison[] {
  const groups = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    const metric = result.samples[0]?.metric ?? 'unknown';
    const key = `${result.scenario}:${metric}`;
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }

  const output: ScenarioComparison[] = [];
  for (const group of groups.values()) {
    const vx = group.find((entry) => entry.identity.framework === 'vx');
    if (!vx) throw new Error(`Scenario '${group[0]?.scenario}' has no VX baseline.`);
    const vxMedian = summarizeSamples(vx.samples).median;
    const rows = group
      .map((entry) => {
        const summary = summarizeSamples(entry.samples);
        return {
          framework: entry.identity.framework,
          version: entry.identity.version,
          median: summary.median,
          p95: summary.p95,
          relativeToVX: relativeDifference(summary.median, vxMedian)
        };
      })
      .sort((left, right) => left.median - right.median);
    output.push({
      scenario: group[0]!.scenario,
      metric: group[0]!.samples[0]!.metric,
      winner: rows[0]!.framework,
      rows: Object.freeze(rows)
    });
  }
  return Object.freeze(output.sort((left, right) => left.scenario.localeCompare(right.scenario)));
}

export function renderMarkdownReport(comparisons: readonly ScenarioComparison[]): string {
  const lines = ['# VX public benchmark report', '', 'Lower is better for every metric in this report.', ''];
  for (const comparison of comparisons) {
    lines.push(
      `## ${comparison.scenario} (${comparison.metric})`,
      '',
      '| Framework | Version | Median | p95 | vs VX |',
      '|---|---:|---:|---:|---:|'
    );
    for (const row of comparison.rows) {
      lines.push(`| ${row.framework} | ${row.version} | ${row.median.toFixed(3)} | ${row.p95.toFixed(3)} | ${(row.relativeToVX * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
