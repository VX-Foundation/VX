import assert from 'node:assert/strict';
import { VXLanguageService, formatVX } from '../packages/tooling/dist/index.js';

const service = new VXLanguageService();
const first = formatVX(`#script
  state value: Int = 1
#end script

#view
  Text("Value: " + value)
#end view
`, '/Live.vx').code;
const opened = service.open('/Live.vx', first, 1);
assert.equal(opened.version, 1);
const use = first.lastIndexOf('value');
assert.equal(service.definition('/Live.vx', use)?.name, 'value');

const second = first.replace('state value: Int = 1', 'state value: Int = 2');
const updated = service.update('/Live.vx', second, 2);
assert.equal(updated.version, 2);
assert.equal(service.diagnostics('/Live.vx').filter((item) => item.severity === 'error').length, 0);
service.close('/Live.vx');
assert.equal(service.get('/Live.vx'), undefined);
console.log('Phase 8 live document runtime verification passed.');
