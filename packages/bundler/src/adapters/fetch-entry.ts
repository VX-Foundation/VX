export function fetchAdapterEntry(
  applicationImport: string,
  options: { includeWaitUntil?: boolean; applicationOptions?: object; assetBinding?: string } = {}
): string {
  const applicationOptions = JSON.stringify(options.applicationOptions ?? { clientEntry: '/assets/vx-client.js' });
  const assetFallback = options.assetBinding
    ? `const assetResponse = await env?.[${JSON.stringify(options.assetBinding)}]?.fetch?.(request);\n    if (assetResponse && assetResponse.status !== 404) return assetResponse;\n    `
    : '';
  return `import createVXServerApplication from ${JSON.stringify(applicationImport)};
const application = createVXServerApplication(${applicationOptions});
const handler = {
  async fetch(request, env, context) {
    ${assetFallback}const response = await application.handle(request);
    if (${options.includeWaitUntil === true ? 'true' : 'false'} && context?.waitUntil) context.waitUntil(application.waitForBackgroundWork?.() ?? Promise.resolve());
    return response;
  }
};
export { application, handler };
export default handler;
`;
}
