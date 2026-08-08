import { describe, expect, it } from 'vitest';
import { createForm, decodeFormData, schema } from '../src/index.js';
import { createServerForm } from '../src/server.js';

describe('VX forms', () => {
  const registration = schema.object({
    name: schema.string().min(2),
    email: schema.email(),
    age: schema.integer().min(13),
    tags: schema.array(schema.string()).min(1)
  });

  it('validates nested typed values', () => {
    expect(registration.parse({ name: 'A', email: 'bad', age: '12', tags: [] }).issues.map((issue) => issue.path)).toEqual(['name', 'email', 'age', 'tags']);
    expect(registration.parse({ name: 'Ana', email: 'ana@example.com', age: '18', tags: ['vx'] }).success).toBe(true);
  });

  it('tracks field and form state', async () => {
    const form = createForm({ schema: registration, initialValues: { name: '', email: '', age: 13, tags: [] as string[] } });
    form.setValue('name', 'VX', { touch: true });
    form.append('tags', 'compiler');
    expect(form.snapshot.dirty).toBe(true);
    expect(form.field('name').touched).toBe(true);
    expect(await form.validate()).toBe(false);
    form.reset();
    expect(form.snapshot.dirty).toBe(false);
  });

  it('decodes repeated and nested form values safely', () => {
    const input = new URLSearchParams([['profile.name', 'VX'], ['roles', 'admin'], ['roles', 'editor']]);
    const decoded = decodeFormData(input);
    expect(decoded).toEqual({ profile: { name: 'VX' }, roles: ['admin', 'editor'] });
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(decoded['profile'] as object)).toBe(Object.prototype);
    expect(() => decodeFormData(new URLSearchParams([['__proto__.polluted', 'yes']]))).toThrow();
  });

  it('runs authoritative server validation', async () => {
    const handle = createServerForm({ schema: registration, sameOrigin: false, authorization: 'public', csrf: 'disabled', action: ({ values }) => ({ ok: true, status: 200, data: values.name }) });
    const response = await handle(new Request('https://vx.veelv.site/register', { method: 'POST', body: new URLSearchParams({ name: 'VX', email: 'vx@example.com', age: '18', tags: 'compiler' }) }));
    expect(response.status).toBe(200);
  });

  it('supports secure native method overrides and generic action failures', async () => {
    const patch = createServerForm({
      schema: schema.object({ name: schema.string().min(2) }),
      method: 'PATCH', authorization: 'public', csrf: 'same-origin', expectedOrigin: 'https://vx.veelv.site',
      action: ({ values }) => ({ ok: true, status: 200, data: values })
    });
    const patched = await patch(new Request('https://vx.veelv.site/profile', {
      method: 'POST', headers: { origin: 'https://vx.veelv.site' },
      body: new URLSearchParams({ _vx_method: 'PATCH', name: 'VX' })
    }));
    expect(patched.status).toBe(200);

    const failing = createServerForm({
      schema: schema.object({ name: schema.string() }), authorization: 'public', csrf: 'disabled', sameOrigin: false,
      action: () => { throw new Error('private database detail'); }
    });
    const failed = await failing(new Request('https://vx.veelv.site/fail', { method: 'POST', body: new URLSearchParams({ name: 'VX' }) }));
    expect(await failed.json()).toEqual(expect.objectContaining({ formError: 'Form action failed.' }));
  });

});
