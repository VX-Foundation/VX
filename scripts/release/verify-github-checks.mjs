import assert from 'node:assert/strict';

const repository = process.env['GITHUB_REPOSITORY'];
const revision = process.env['GITHUB_SHA'];
const token = process.env['GITHUB_TOKEN'];

if (!repository || !revision || !token) {
  if (process.env['CI'] || process.env['GITHUB_ACTIONS']) {
    assert.ok(repository && revision && token, 'GITHUB_REPOSITORY, GITHUB_SHA, and GITHUB_TOKEN are required in CI.');
  }
  console.log('VX GitHub checks verification skipped (requires GitHub Actions CI environment with GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_TOKEN).');
  process.exit(0);
}
const requirements = [
  { label: 'cross-platform Node matrix', pattern: /^verify \(/u, minimum: 6 },
  { label: 'framework phases', pattern: /^framework phases and official applications$/u, minimum: 1 },
  { label: 'browser matrix', pattern: /^browsers \(Chromium, Firefox, WebKit\)$/u, minimum: 1 },
  { label: 'clean-room', pattern: /^clean-room packages and generated projects$/u, minimum: 1 },
  { label: 'official applications', pattern: /^applications$/u, minimum: 1 },
  { label: 'continuous security', pattern: /^security$/u, minimum: 1 },
  { label: 'CodeQL', pattern: /^analyze/u, minimum: 1 }
];
const checks = [];
for (let page = 1; page <= 5; page += 1) {
  const response = await fetch(`https://api.github.com/repos/${repository}/commits/${revision}/check-runs?per_page=100&page=${page}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28'
    }
  });
  assert.equal(response.ok, true, `GitHub checks request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const pageChecks = Array.isArray(payload.check_runs) ? payload.check_runs : [];
  checks.push(...pageChecks);
  if (pageChecks.length < 100) break;
}
for (const requirement of requirements) {
  const matching = checks.filter((check) => typeof check.name === 'string' && requirement.pattern.test(check.name));
  assert.ok(matching.length >= requirement.minimum, `Required ${requirement.label} checks were not found for ${revision}.`);
  assert.ok(matching.every((check) => check.status === 'completed' && check.conclusion === 'success'), `Required ${requirement.label} checks are not all successful.`);
}
console.log(`VX protected GitHub checks passed for ${revision}.`);
