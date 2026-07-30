import { timingSafeEqual } from 'node:crypto';
import { env, readServerEnvironment, type ServerPrincipal } from '@vx/server';
import { createSessionManager, MemorySessionStore, type SessionManager } from '@vx/server/sessions';

export interface DashboardSession {
  tenantId?: string;
  locale?: string;
  [key: string]: unknown;
}

let sharedManager: SessionManager<DashboardSession> | undefined;

export function createDashboardSessionManager(secret: string): SessionManager<DashboardSession> {
  return createSessionManager<DashboardSession>({
    secret,
    store: new MemorySessionStore<DashboardSession>(),
    createData: () => ({ locale: 'en-US' }),
    rolling: true
  });
}

export function dashboardSessionManagerFromEnvironment(source: Record<string, string | undefined> = process.env): SessionManager<DashboardSession> {
  const configuration = readDashboardAuthEnvironment(source);
  if (source === process.env) return sharedManager ??= createDashboardSessionManager(configuration.DASHBOARD_SESSION_SECRET);
  return createDashboardSessionManager(configuration.DASHBOARD_SESSION_SECRET);
}

export function authenticateDashboardCredentials(
  email: string,
  password: string,
  source: Record<string, string | undefined> = process.env
): ServerPrincipal | undefined {
  const configuration = readDashboardAuthEnvironment(source);
  if (!constantTimeEqual(password, configuration.DASHBOARD_DEMO_PASSWORD)) return undefined;
  const normalized = email.trim().toLowerCase();
  const role = normalized === 'admin@vx.example' ? 'admin'
    : normalized === 'analyst@vx.example' ? 'analyst'
      : normalized === 'viewer@vx.example' ? 'viewer'
        : undefined;
  return role ? principalFor(normalized, role) : undefined;
}

export function principalFor(userId: string, role: 'admin' | 'analyst' | 'viewer'): ServerPrincipal {
  const permissions = role === 'admin'
    ? ['dashboard.read', 'users.manage', 'reports.create', 'settings.write']
    : role === 'analyst'
      ? ['dashboard.read', 'reports.create']
      : ['dashboard.read'];
  return { id: userId, roles: [role], permissions };
}

function readDashboardAuthEnvironment(source: Record<string, string | undefined>) {
  return readServerEnvironment({
    DASHBOARD_SESSION_SECRET: { parse: env.string({ minLength: 32 }), secret: true },
    DASHBOARD_DEMO_PASSWORD: { parse: env.string({ minLength: 12 }), secret: true }
  }, source);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}
