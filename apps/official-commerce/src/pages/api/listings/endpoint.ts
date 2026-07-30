import { schema } from '@vx/forms';
import { createServerForm } from '@vx/forms/server';
import { verifyCommerceCsrf } from '../../../server/security.js';

const listingSchema = schema.object({
  title: schema.string().min(3).max(120),
  image: schema.file().maxSize(5 * 1024 * 1024).mime('image/jpeg', 'image/png', 'image/webp')
});

export const POST = createServerForm({
  schema: listingSchema,
  method: 'POST',
  authorization: 'authenticated',
  csrf: 'required',
  authorize: async ({ request }) => request.headers.get('x-demo-user') === 'seller',
  verifyCsrf: verifyCommerceCsrf,
  action: async ({ values }) => ({ ok: true, status: 201, data: { title: values.title, uploaded: true } })
});
