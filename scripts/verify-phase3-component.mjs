import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';
import {
  QueryClient,
  StoreRegistry,
  defineStore
} from '../packages/runtime/dist/client.js';
import { FakeElement, installFakeDom } from './test-support/fake-dom.mjs';

await main();

async function main() {
  installFakeDom();
  const source = `#script
    prop loader: ProductLoader
    prop audit: AuditWriter
    state page: Int = 1

    query products from loader {
      page: page
      policy {
        stale: 30s
        retain: 0ms
        retry: 0
        execute: client
      }
    }

    action nextPage() {
      page++
      invalidate(products)
    }

    effect reportStatus {
      audit(products.status)
    }

    store cart from "cart" lifetime route
  #end script

  #view
    View {
      Text(products.data ? "Item: " + products.data[0] : "Loading")
      Text(nextPage.running ? "Changing" : "Idle")
      Text(cart.label)
      Button("Next") {
        disabled: nextPage.running
        click => nextPage()
      }
    }
  #end view`;

  const parsed = parse(source, 'phase3-component.vx');
  assert.deepEqual(parsed.diagnostics, []);
  const analysis = analyze(parsed.ast);
  assert.deepEqual(analysis.diagnostics, []);
  const output = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);

  const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
  const temporary = await mkdtemp(join(tmpdir(), 'vx-phase3-component-'));
  try {
    const runtimeUrl = pathToFileURL(join(rootDirectory, 'packages/runtime/dist/client.js')).href;
    const modulePath = join(temporary, 'component.mjs');
    await writeFile(
      modulePath,
      output.clientCode.replace("'@vx/runtime/client'", JSON.stringify(runtimeUrl)),
      'utf8'
    );
    const { default: mount } = await import(`${pathToFileURL(modulePath).href}?run=${Date.now()}`);

    const queryClient = new QueryClient();
    const stores = new StoreRegistry({ routeId: 'catalog' });
    stores.register(defineStore({
      key: 'cart',
      lifetime: 'route',
      create: () => ({ label: 'Cart ready' })
    }));
    const pages = [];
    const statuses = [];
    const loader = async ({ page }) => {
      pages.push(page);
      await Promise.resolve();
      return [`Product ${page}`];
    };
    const mountRoot = new FakeElement('main');
    const unmount = mount(mountRoot, { loader, audit: (status) => statuses.push(status) }, { queryClient, stores });

    await settle();
    assert.deepEqual(readText(mountRoot), ['Item: Product 1', 'Idle', 'Cart ready', 'Next']);
    const button = findElement(mountRoot, 'BUTTON');
    assert(button);
    button.dispatch('click');
    await settle();
    await settle();
    assert.deepEqual(readText(mountRoot), ['Item: Product 2', 'Idle', 'Cart ready', 'Next']);
    assert.equal(pages.at(-1), 2);
    assert(statuses.includes('loading'));
    assert(statuses.includes('success'));

    unmount();
    await settle();
    assert.equal(mountRoot.childNodes.length, 0);
    assert.equal(queryClient.dehydrate().length, 0, 'component query must release its zero-retention cache entry');
    stores.disposeLifetime('route', 'catalog');
    stores.dispose();
    queryClient.dispose();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  console.log('VX Phase 3 component verification passed (compiled query, managed action, effect, store, DOM update, and cleanup).');
}

function findElement(root, tagName) {
  const queue = [...root.childNodes];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node instanceof FakeElement && node.tagName === tagName) return node;
    queue.push(...(node?.childNodes ?? []));
  }
  return undefined;
}

function readText(root) {
  const values = [];
  const visit = (node) => {
    if (node instanceof FakeElement && ['SPAN', 'BUTTON'].includes(node.tagName)) values.push(node.textContent);
    else for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  return values;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
