import { authorizeServerRequest, type AuthorizationPolicy } from '@vx/server';

export const dashboardPolicies = Object.freeze({
  overview: { permissions: ['dashboard.read'] },
  manageUsers: { permissions: ['users.manage'] },
  createReports: { permissions: ['reports.create'] },
  writeSettings: { permissions: ['settings.write'] }
} satisfies Record<string, AuthorizationPolicy>);

export { authorizeServerRequest };
