const categories = ['component','state','derive','effect','query','action','cache','route','hydration','island','boundary','performance','memory','hmr','server-payload'];
const status = document.querySelector('#status');
const summary = document.querySelector('#summary');
const output = document.querySelector('#output');
const navigation = document.querySelector('#categories');
let selected = 'component';
let paused = false;
let timer;

for (const category of categories) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = category;
  button.dataset.category = category;
  button.setAttribute('aria-pressed', String(category === selected));
  button.addEventListener('click', () => { selected = category; updatePressed(); refresh(); });
  navigation.append(button);
}
document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#pause').addEventListener('click', (event) => {
  paused = !paused;
  event.currentTarget.textContent = paused ? 'Resume' : 'Pause';
  schedule();
});

function updatePressed() {
  for (const button of navigation.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.category === selected));
}
function schedule() {
  clearTimeout(timer);
  if (!paused) timer = setTimeout(async () => { await refresh(); schedule(); }, 1000);
}
function refresh() {
  return new Promise((resolve) => {
    const expression = `(function(){const key=Symbol.for('vx.devtools.bridge');const bridge=globalThis[key];return bridge&&typeof bridge.snapshot==='function'?bridge.snapshot():null})()`;
    chrome.devtools.inspectedWindow.eval(expression, (snapshot, exception) => {
      if (exception || !snapshot) {
        status.textContent = exception ? 'Inspection failed' : 'VX runtime not detected';
        summary.textContent = 'Open a development build with the VX DevTools bridge enabled.';
        output.textContent = '';
        resolve(); return;
      }
      const records = Array.isArray(snapshot.entities) ? snapshot.entities.filter((record) => record.category === selected) : [];
      const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics.filter((metric) => metric.category === selected) : [];
      const events = selected === 'hmr' ? (snapshot.hmr ?? []) : selected === 'server-payload' ? (snapshot.serverPayloads ?? []) : [];
      status.textContent = `Connected · ${snapshot.sequence ?? 0} events`;
      const count = records.length + metrics.length + events.length;
      summary.textContent = `${count} ${selected} record${count === 1 ? '' : 's'}`;
      output.textContent = JSON.stringify({ records, metrics, events: events.slice(-200) }, null, 2);
      resolve();
    });
  });
}
refresh().then(schedule);
