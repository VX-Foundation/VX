import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compileComponentProject } from '../../packages/compiler/dist/project.js';
import { FakeElement, installFakeDom } from '../test-support/fake-dom.mjs';
import { writeValidComponentProject } from './fixtures.mjs';

export async function verifyPhase4Runtime(temporaryRoot) {
  installFakeDom();
  const sourceRoot = join(temporaryRoot, 'source');
  const outputRoot = join(temporaryRoot, 'output');
  await writeValidComponentProject(sourceRoot);
  await mkdir(outputRoot, { recursive: true });

  const result = compileComponentProject(join(sourceRoot, 'App.vx'), { rootDir: sourceRoot });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.artifacts.size, 3);
  assert(result.entryId);

  const runtimeUrl = pathToFileURL(resolve('packages/runtime/dist/client.js')).href;
  for (const artifact of result.artifacts.values()) {
    assert(!artifact.outputFileName.includes(':'), 'artifact filenames must be portable across operating systems');
    await writeFile(
      join(outputRoot, artifact.outputFileName),
      artifact.clientCode.replaceAll("'@vx/runtime/client'", JSON.stringify(runtimeUrl)),
      'utf8'
    );
  }

  const entry = result.artifacts.get(result.entryId);
  assert(entry);
  const module = await import(`${pathToFileURL(join(outputRoot, entry.outputFileName)).href}?run=${Date.now()}`);
  const root = new FakeElement('main');
  const unmount = module.default(root);

  assert.deepEqual(readLeafText(root), ['Industrial VX', 'Projected content', 'Select', 'Selected: ']);
  const heading = findElement(root, 'H1');
  assert(heading);
  assert.equal(heading.dataset['vxRole'], 'title', 'parent visual part must apply semantic intent to the child part');
  assert((heading.getAttribute('class') ?? '').includes('-part-title'), 'parent visual part class must reach the public child part');

  const button = findElement(root, 'BUTTON');
  assert(button);
  button.dispatch('click');
  await settle();
  assert.deepEqual(readLeafText(root), ['Industrial VX', 'Projected content', 'Select', 'Selected: Industrial VX']);

  unmount();
  await settle();
  assert.equal(root.childNodes.length, 0, 'nested component boundaries and projected content must be removed');
  await rm(outputRoot, { recursive: true, force: true });
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

function readLeafText(root) {
  const values = [];
  const visit = (node) => {
    if (node instanceof FakeElement && ['H1', 'SPAN', 'BUTTON'].includes(node.tagName)) values.push(node.textContent);
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
