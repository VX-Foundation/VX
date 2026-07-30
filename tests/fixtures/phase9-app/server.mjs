import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createCsrfToken, verifyCsrfToken } from '../../../packages/runtime/dist/server.js';
import { schema } from '../../../packages/forms/dist/index.js';
import { createServerForm } from '../../../packages/forms/dist/server.js';

const port = Number(process.env.PORT ?? '4177');
const origin = `http://127.0.0.1:${port}`;
const secret = 'phase9-browser-fixture-secret-with-more-than-32-bytes';
const session = 'browser-session';
const token = await createCsrfToken({ secret, binding: session });
const nonce = randomBytes(18).toString('base64url');
const browserForm = createServerForm({
  schema: schema.object({ name: schema.string().min(2), email: schema.email() }),
  method: 'POST', authorization: 'public', csrf: 'required', expectedOrigin: origin,
  verifyCsrf: (_request, value) => value === token,
  action: ({ values }) => ({ ok: true, status: 200, redirect: `/form/success?name=${encodeURIComponent(values.name)}` })
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', origin);
  securityHeaders(response, nonce);
  if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, 'text/plain', 'ok');
  if (request.method === 'GET' && url.pathname === '/form') return send(response, 200, 'text/html; charset=utf-8', formDocument(token, nonce));
  if (request.method === 'GET' && url.pathname === '/form/success') return send(response, 200, 'text/html; charset=utf-8', `<!doctype html><html lang="en"><body><main><h1>Registration complete</h1><p>Welcome ${escapeHtml(url.searchParams.get('name') ?? '')}</p></main></body></html>`);
  if (request.method === 'POST' && url.pathname === '/form-submit') {
    const webResponse = await browserForm(await toWebRequest(request, origin));
    return pipeWebResponse(response, webResponse);
  }
  if (request.method === 'POST' && url.pathname === '/_vx/rpc/increment') {
    const requestOrigin = request.headers.origin;
    const csrf = request.headers['x-vx-csrf'];
    if (requestOrigin !== origin || typeof csrf !== 'string' || !(await verifyCsrfToken(csrf, { secret, binding: session }))) {
      return send(response, 403, 'application/json', JSON.stringify({ ok: false }));
    }
    return send(response, 200, 'application/json', JSON.stringify({ ok: true, value: 1 }));
  }
  if (request.method !== 'GET' || url.pathname !== '/') return send(response, 404, 'text/plain', 'Not found');
  const payload = url.searchParams.get('payload') ?? 'safe';
  return send(response, 200, 'text/html; charset=utf-8', document(payload, token, nonce));
});
server.listen(port, '127.0.0.1', () => console.log(`VX Phase 9 fixture listening at ${origin}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));

function document(payload, csrf, scriptNonce) {
  const safeState = JSON.stringify({ payload }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VX Phase 9</title></head><body><main id="vx-app"><h1>VX production fixture</h1><p id="payload"></p><label for="name">Name</label><input id="name" autocomplete="name"><button id="increment" type="button">Increment</button><output id="count" aria-live="polite">0</output><a id="external" href="https://vx.dev" target="_blank" rel="noopener noreferrer">VX documentation</a><a id="blocked" data-vx-blocked-url="javascript:alert(1)">Blocked link</a></main><script type="application/json" id="__VX_STATE__" nonce="${scriptNonce}">${safeState}</script><script nonce="${scriptNonce}">const state=JSON.parse(document.getElementById('__VX_STATE__').textContent);document.getElementById('payload').textContent=state.payload;document.getElementById('increment').addEventListener('click',async()=>{const response=await fetch('/_vx/rpc/increment',{method:'POST',headers:{'content-type':'application/json','x-vx-csrf':${JSON.stringify(csrf)}},body:JSON.stringify({args:[]})});if(response.ok){const count=document.getElementById('count');count.textContent=String(Number(count.textContent)+1)}});</script></body></html>`;
}
function formDocument(csrf, scriptNonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VX Forms</title></head><body><main><h1>Create account</h1><div id="form-errors" role="alert" aria-live="assertive" hidden></div><form id="registration" action="/form-submit" method="post" enctype="multipart/form-data" novalidate><input type="hidden" name="_vx_csrf" value="${csrf}"><label for="form-name">Name</label><input id="form-name" name="name" autocomplete="name"><span id="name-error"></span><label for="form-email">Email</label><input id="form-email" name="email" type="email" autocomplete="email"><span id="email-error"></span><button type="submit">Create account</button></form></main><script nonce="${scriptNonce}">document.getElementById('registration').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const response=await fetch(form.action,{method:'POST',headers:{accept:'application/json','x-vx-csrf':form.elements._vx_csrf.value},body:new FormData(form)});if(response.ok){const result=await response.json();if(result.redirect){location.assign(result.redirect);return}}const result=await response.json();const summary=document.getElementById('form-errors');summary.hidden=false;summary.textContent=result.formError||result.fieldErrors.map(issue=>issue.message).join(' ');for(const input of form.elements){if(input.name)input.removeAttribute('aria-invalid')}for(const issue of result.fieldErrors){const input=form.elements.namedItem(issue.path);if(input){input.setAttribute('aria-invalid','true');document.getElementById(issue.path+'-error').textContent=issue.message}}const first=result.fieldErrors[0]&&form.elements.namedItem(result.fieldErrors[0].path);if(first)first.focus()});</script></body></html>`;
}
async function toWebRequest(request, base) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  return new Request(new URL(request.url ?? '/', base), { method: request.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
}
async function pipeWebResponse(response, webResponse) {
  response.statusCode = webResponse.status;
  for (const [name, value] of webResponse.headers) response.setHeader(name, value);
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
function escapeHtml(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function securityHeaders(response, scriptNonce) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader('cross-origin-opener-policy', 'same-origin');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.setHeader('content-security-policy', `default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; script-src 'self' 'nonce-${scriptNonce}'; script-src-attr 'none'; style-src 'self'`);
}
function send(response, status, type, body) { response.statusCode = status; response.setHeader('content-type', type); response.end(body); }
