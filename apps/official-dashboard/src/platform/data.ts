import { QueryClient, createAction, createQuery, state } from '@vx/runtime';

export const dashboardQueryClient = new QueryClient();
const range = state('30d');

export const metricsQuery = createQuery(dashboardQueryClient, {
  name: 'dashboard.metrics',
  input: () => ({ range: range.value }),
  source: async ({ range: selectedRange }) => ({
    range: selectedRange,
    revenue: selectedRange === '7d' ? 48200 : 184200,
    activeUsers: selectedRange === '7d' ? 1910 : 4280
  }),
  tags: ['dashboard', 'metrics'],
  policy: { staleTimeMs: 30_000, retentionTimeMs: 300_000, retries: 2 }
});

export const selectDashboardRange = createAction(async (context, nextRange: string) => {
  context.commit(() => { range.value = nextRange; });
  context.invalidate(metricsQuery);
  return nextRange;
}, { name: 'dashboard.range.select', queryClient: dashboardQueryClient });
