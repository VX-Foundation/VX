import assert from 'node:assert/strict';
import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';
import { VXLanguageService } from '../packages/tooling/dist/index.js';

const source = `#script
  prop userId: Int
  state active: Bool = true

  query profile from loadProfile {
    id: userId
    policy {
      stale: 30s
      retain: 10m
      retry: 4
      retryDelay: 100ms
      backoff: exponential
      execute: universal
      network: offlineFirst
      deduplicate: true
      refreshOnFocus: true
      refreshOnReconnect: true
      refreshInterval: 1m
      structuralSharing: true
      persist: true
      tags: ["profile", "users"]
      enabled: active
    }
  }

  action rename(name: String) {
    progress({ loaded: 1, total: 2 })
    optimistic(profile, { name: name })
    invalidateTags(["users"])
    progress({ loaded: 2, total: 2 })
  }
#end script

#view
  Text(profile.paused ? "Offline" : profile.data.name)
#end view`;

const parsed = parse(source, 'phase13-data.vx');
assert.deepEqual(parsed.diagnostics, []);
const analyzed = analyze(parsed.ast);
assert.deepEqual(analyzed.diagnostics, []);
const policy = analyzed.data.queries[0]?.policy;
assert.equal(policy?.networkMode, 'offline-first');
assert.equal(policy?.refetchIntervalMs, 60_000);
assert.equal(policy?.structuralSharing, true);
assert.equal(policy?.persist, true);
assert.deepEqual(policy?.tags, ['profile', 'users']);
assert.equal(policy?.enabled?.text, 'active');

const output = lower(parsed.ast, analyzed.graph, analyzed.visual, analyzed.data);
assert.match(output.clientCode, /enabled: \(\) => \(active\.value\)/);
assert.match(output.clientCode, /tags: \["profile","users"\]/);
assert.match(output.clientCode, /"networkMode":"offline-first"/);
assert.match(output.clientCode, /__vxAction\.invalidateTags/);
assert.match(output.clientCode, /__vxAction\.reportProgress/);
assert.doesNotMatch(output.clientCode, /"enabled":/);
assert.match(output.serverCode, /enabled: \(\) => \(active\)/);

const invalid = parse(`#script
  query broken from load {
    policy {
      network: sometimes
      tags: ["ok", 1]
      refreshInterval: soon
    }
  }
#end script`, 'phase13-invalid.vx');
const invalidAnalysis = analyze(invalid.ast);
const codes = invalidAnalysis.diagnostics.map((diagnostic) => diagnostic.code);
assert(codes.filter((code) => code === 'VX_QUERY_INVALID_POLICY').length >= 3);

const service = new VXLanguageService();
const policySource = `#script
  query items from load {
    policy {
      
    }
  }
#end script`;
service.open('phase13-policy.vx', policySource, 1);
const completions = service.completions('phase13-policy.vx', policySource.indexOf('      \n') + 6).map((entry) => entry.label);
for (const expected of ['network', 'refreshInterval', 'structuralSharing', 'persist', 'tags', 'enabled']) assert(completions.includes(expected));

console.log('VX Phase 13 compiler verification passed (data policies, tags, enablement, action helpers, and language-service completions).');
