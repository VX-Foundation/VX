import * as monaco from 'monaco-editor';

const defaultCode = `#script
  state count: Int = 0
  derive doubled: Int = count * 2

  action increment() {
    count++
  }
#end script

#view
  View {
    Text("VX Playground")
    Text("Clicks: " + count)
    Text("Doubled: " + doubled)

    Button("Increment") {
      click => increment()
    }
  }
#end view
`;

const editor = monaco.editor.create(requiredElement('editor-container'), {
  value: defaultCode,
  language: 'plaintext',
  theme: 'vs-dark',
  automaticLayout: true,
  minimap: { enabled: false }
});
const previewFrame = requiredElement('preview-frame') as HTMLIFrameElement;
const output = requiredElement('generated-output');
const diagnostics = requiredElement('diagnostics');
const inspector = requiredElement('inspector');
const compilerWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let selectedOutput: 'client' | 'server' = 'client';
let latest: Record<string, unknown> | undefined;

compilerWorker.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data as { type: string; payload: Record<string, unknown> };
  if (type === 'COMPILED') {
    latest = payload;
    renderCompiled(payload);
    return;
  }
  renderError(String(payload['message'] ?? 'Unknown compilation error.'));
};

document.querySelectorAll<HTMLButtonElement>('[data-output]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedOutput = button.dataset['output'] === 'server' ? 'server' : 'client';
    if (latest) renderGenerated(latest);
  });
});

let timer: ReturnType<typeof setTimeout> | undefined;
function compile(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => compilerWorker.postMessage({ type: 'COMPILE', payload: { source: editor.getValue() } }), 80);
}

function renderCompiled(payload: Record<string, unknown>): void {
  const generated = payload['generated'] as { client?: string; server?: string } | undefined;
  if (!generated?.client) return renderError('Compiler did not emit client output.');
  diagnostics.textContent = JSON.stringify(payload['diagnostics'] ?? [], null, 2);
  inspector.textContent = JSON.stringify({
    reactiveGraph: payload['reactiveGraph'], visual: payload['visual'], boundaries: payload['boundaries']
  }, null, 2);
  renderGenerated(payload);
  renderPreview(generated.client);
}

function renderGenerated(payload: Record<string, unknown>): void {
  const generated = payload['generated'] as { client?: string; server?: string } | undefined;
  output.textContent = selectedOutput === 'server' ? generated?.server ?? '' : generated?.client ?? '';
}

function renderPreview(clientCode: string): void {
  const doc = previewFrame.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"@vx/runtime/client":"/@id/@vx/runtime/client"}}<\/script></head><body><main id="app"></main><script type="module">${clientCode.replace(/<\/script/gi, '<\\/script')}\nmountApp(document.getElementById('app'));<\/script></body></html>`);
  doc.close();
}

function renderError(message: string): void {
  diagnostics.textContent = message;
  output.textContent = '';
  inspector.textContent = '';
  const doc = previewFrame.contentWindow?.document;
  if (doc) { doc.open(); doc.write(`<pre>${escapeHtml(message)}</pre>`); doc.close(); }
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Playground element '#${id}' was not found.`);
  return element;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

compile();
editor.onDidChangeModelContent(compile);
