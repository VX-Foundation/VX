import assert from 'node:assert/strict';
import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';

const source = `#script
  prop loader: ProductLoader
  state page: Int = 1

  query products from loader {
    page: page

    policy {
      stale: 30s
      retain: 5m
      retry: 3
      retryDelay: 250ms
      backoff: exponential
      execute: client
      deduplicate: true
      refreshOnFocus: false
      refreshOnReconnect: true
    }
  }

  action nextPage() {
    page++
    invalidate(products)
  }

  effect observeStatus {
    console.log(products.status)
  }

  store cart from "cart" lifetime route
#end script

#view
  Text(products.loading ? "Loading" : "Ready")
  Text("Page: " + page)
  Button(nextPage.running ? "Working" : "Next") {
    disabled: nextPage.running
    click => nextPage()
  }
#end view`;

const parsed = parse(source, 'phase3-core.vx');
assert.deepEqual(parsed.diagnostics, []);
const script = parsed.ast.blocks.find((block) => block.kind === 'ScriptBlock');
assert.equal(script?.kind, 'ScriptBlock');
const query = script?.statements.find((statement) => statement.kind === 'QueryDeclaration');
assert.equal(query?.kind, 'QueryDeclaration');
assert.equal(query.policy.length, 9);
const store = script?.statements.find((statement) => statement.kind === 'StoreDeclaration');
assert.equal(store?.kind, 'StoreDeclaration');
assert.equal(store.lifetime, 'route');

const result = analyze(parsed.ast);
assert.deepEqual(result.diagnostics, []);
assert.equal(result.data.queries.length, 1);
assert.equal(result.data.actions.length, 1);
assert.equal(result.data.effects.length, 1);
assert.equal(result.data.stores.length, 1);
assert.deepEqual(result.data.queries[0]?.policy, {
  staleTimeMs: 30_000,
  retentionTimeMs: 300_000,
  retries: 3,
  retryDelayMs: 250,
  retryBackoff: 'exponential',
  execution: 'client',
  networkMode: 'online',
  deduplicate: true,
  refreshOnFocus: false,
  refreshOnReconnect: true,
  refetchIntervalMs: 0,
  structuralSharing: true,
  persist: false,
  tags: []
});
assert.deepEqual(
  [...(result.graph.nodes.get('products')?.dependencies ?? [])].sort(),
  ['loader', 'page']
);

const output = lower(parsed.ast, result.graph, result.visual, result.data);
assert.match(output.clientCode, /createQuery\(__vxQueryClient/);
assert.match(output.clientCode, /createAction\(/);
assert.match(output.clientCode, /__vxAction\.invalidate\(products\)/);
assert.match(output.clientCode, /managedEffect\(/);
assert.match(output.clientCode, /acquireStore\(__vxStores, "cart", "route"/);
assert.match(output.clientCode, /nextPage\.running/);
assert.doesNotMatch(output.clientCode, /ctxVar|:\s*any/);

const server = parse(`#script
  server action save(input: SaveInput): SaveResult {
    return await Database.save(input)
  }
#end script`, 'server-action.vx');
assert.deepEqual(server.diagnostics, []);
const serverAnalysis = analyze(server.ast);
assert.deepEqual(serverAnalysis.diagnostics, []);
const serverOutput = lower(server.ast, serverAnalysis.graph, serverAnalysis.visual, serverAnalysis.data);
assert.match(serverOutput.clientCode, /createServerAction\("[^"]+:save"\)/);
assert.match(serverOutput.clientCode, /createAction\(/);
assert.match(serverOutput.serverCode, /registerServerAction\(\{"id":"[^"]+:save"/);

assertAnalysisDiagnostic(`#script
  prop loader: Loader
  query items from loader { nonce: Date.now() }
#end script`, 'VX_QUERY_NON_DETERMINISTIC_KEY');
assertAnalysisDiagnostic(`#script
  prop loader: Loader
  query items from loader { policy { stale: soon } }
#end script`, 'VX_QUERY_INVALID_POLICY');
assertAnalysisDiagnostic(`#script
  prop loader: Loader
  query items from loader { page: 1\n page: 2 }
#end script`, 'VX_QUERY_DUPLICATE_INPUT');
assertAnalysisDiagnostic(`#script
  server action save(input) { return input }
#end script`, 'VX_SERVER_ACTION_PARAMETER_TYPE');
assertAnalysisDiagnostic(`#script
  server action save(input: String) { return input }
#end script`, 'VX_SERVER_ACTION_RETURN_TYPE');
assertAnalysisDiagnostic(`#script
  effect listen { window.addEventListener("resize", handler) }
#end script`, 'VX_EFFECT_MISSING_CLEANUP');
assertAnalysisDiagnostic(`#script
  store requestData from "request-data" lifetime request
#end script`, 'VX_STORE_LIFETIME_TARGET');
assertAnalysisDiagnostic(`#script
  server store session from "session" lifetime application
#end script`, 'VX_STORE_SERVER_ISOLATION');
assertAnalysisDiagnostic(`#script
  state secret: String = process.env.SECRET
#end script`, 'VX_ENV_LEAK');
assertAnalysisDiagnostic(`#script
  prop loader: Loader
  query privateData from loader {
    account: process.env.ACCOUNT_ID
  }
#end script`, 'VX_ENV_LEAK');
assertAnalysisDiagnostic(`#script
  state token: String = "x"
  server action save(input: String): String { return token + input }
#end script`, 'VX_SERVER_CAPTURE_CLIENT_STATE');

console.log('VX Phase 3 compiler verification passed (Data IR, policies, actions, effects, stores, and security boundaries).');

function assertAnalysisDiagnostic(sourceText, code) {
  const syntax = parse(sourceText, `${code}.vx`);
  assert.deepEqual(syntax.diagnostics, []);
  const diagnostics = analyze(syntax.ast).diagnostics;
  assert(
    diagnostics.some((diagnostic) => diagnostic.code === code),
    `Expected ${code}, received: ${diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`
  );
}
