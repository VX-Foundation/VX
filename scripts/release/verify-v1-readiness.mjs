import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const channel = argument('--channel') ?? 'next';
assert.ok(['canary', 'next', 'stable'].includes(channel), `Unsupported release channel '${channel}'.`);
const readiness = readJson('release/v1-readiness.json');
const issues = [];
for (const criterion of readiness.criteria ?? []) {
  const relevant = channel === 'stable' || criterion.requiredForNext === true || channel === 'canary';
  if (!relevant) continue;
  if (channel !== 'stable' && criterion.requiredForNext !== true && criterion.id !== 'specification-frozen') continue;
  if (!['complete', 'automated', 'external-automated'].includes(criterion.status)) {
    issues.push(`${criterion.id}: status is '${criterion.status}'.`);
    continue;
  }
  for (const evidence of criterion.evidence ?? []) {
    if (!existsSync(resolve(root, evidence))) issues.push(`${criterion.id}: missing evidence '${evidence}'.`);
  }
}
if (channel === 'stable') {
  verifyStableEvidence(issues);
  verifyStabilization(issues);
}
if (issues.length > 0) {
  for (const issue of issues) console.error(`VX 1.0 blocker: ${issue}`);
  throw new Error(`VX ${channel} readiness failed with ${issues.length} blocker(s).`);
}
console.log(`VX ${channel} readiness passed.`);

function verifyStableEvidence(issues) {
  for (const path of [
    'release/evidence/external-audit.json',
    'release/evidence/public-benchmarks.json',
    'release/evidence/production-applications.json'
  ]) {
    if (!existsSync(resolve(root, path))) {
      issues.push(`stable evidence '${path}' is not present.`);
      continue;
    }
    const evidence = readJson(path);
    if (evidence.status !== 'complete') issues.push(`stable evidence '${path}' is not complete.`);
    if (typeof evidence.integrity !== 'string' || !/^[a-f0-9]{64}$/u.test(evidence.integrity)) {
      issues.push(`stable evidence '${path}' has no valid SHA-256 integrity.`);
    }
  }
  if (process.env['VX_STABLE_CI_VERIFIED'] !== 'true') {
    issues.push('protected cross-platform, Node, browser, security, and adapter checks were not verified for this source revision.');
  }
}

function verifyStabilization(issues) {
  const policy = readJson('release/stabilization-policy.json');
  const log = readJson('release/stabilization-log.json');
  verifyReleaseWindow('canary', log.canary, policy.canary, issues);
  verifyReleaseWindow('next', log.next, policy.next, issues);
  const openHigh = (log.incidents ?? []).filter((incident) => incident.status !== 'closed' && ['high', 'critical'].includes(incident.severity)).length;
  if (openHigh > (policy.next?.maximumOpenSeverityHighIncidents ?? 0)) {
    issues.push(`stabilization log contains ${openHigh} open high/critical incident(s).`);
  }
}

function verifyReleaseWindow(name, entries, policy, issues) {
  if (!Array.isArray(entries) || entries.length < policy.minimumReleases) {
    issues.push(`${name} requires at least ${policy.minimumReleases} recorded releases.`);
    return;
  }
  const dates = entries.map((entry) => Date.parse(entry.publishedAt)).filter(Number.isFinite).sort((a, b) => a - b);
  if (dates.length !== entries.length) {
    issues.push(`${name} stabilization log contains an invalid publication date.`);
    return;
  }
  const elapsed = (dates.at(-1) - dates[0]) / 86_400_000;
  if (elapsed < policy.minimumCalendarDays) {
    issues.push(`${name} stabilization requires ${policy.minimumCalendarDays} calendar days; only ${elapsed.toFixed(1)} are recorded.`);
  }
  for (const entry of entries) {
    if (typeof entry.version !== 'string' || typeof entry.revision !== 'string' || typeof entry.integrity !== 'string') {
      issues.push(`${name} stabilization entry is incomplete.`);
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}
function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
