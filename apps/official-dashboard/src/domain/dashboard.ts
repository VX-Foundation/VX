export interface MetricPoint { at: string; revenue: number; users: number; }
export interface UserRow { id: string; name: string; role: string; status: string; }

export function summarizeMetrics(points: readonly MetricPoint[]) {
  return points.reduce((summary, point) => ({
    revenue: summary.revenue + point.revenue,
    users: Math.max(summary.users, point.users)
  }), { revenue: 0, users: 0 });
}

export function filterUsers(users: readonly UserRow[], search: string): readonly UserRow[] {
  const query = search.trim().toLowerCase();
  if (!query) return users;
  return users.filter((user) => `${user.name} ${user.role} ${user.status}`.toLowerCase().includes(query));
}

export function canSuspend(actorRole: string, targetRole: string): boolean {
  return actorRole === 'admin' && targetRole !== 'admin';
}
