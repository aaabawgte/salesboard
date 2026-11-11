export type Employee = { id: number; name: string; quantity: number; cents: number; value: number; rank: number; avg: number | null; share: number | null; days: Array<{ date: string; quantity: number; cents: number; value: number }> };
export type TargetProgress = { configured: boolean; targetCents: number; achievedCents: number; remainingCents: number; dailyTargetCents: number; requiredDailyCents: number; workingDaysTotal: number; elapsedWorkingDays: number; remainingWorkingDays: number; progress: number };
export type Branch = { id: number; code: string; name: string };
export type PortalUser = { id: number; username: string; displayName: string; role: 'employee' | 'manager' | 'superadmin'; status: string; employeeId: number | null; leaderboardVisibility: 'own' | 'rank' | 'full'; branch: Branch };
export type Analytics = { from: string; to: string; totalCents: number; total: number; quantity: number; leaderboard: Employee[]; employees: Employee[]; daily: Array<{ date: string; quantity: number; cents: number; value: number }>; rows: Array<{ date: string; employee: string; employee_id: number; quantity: number; cents: number; value: number }>; latestImport: { imported_at: string; file_name: string } | null; target?: TargetProgress; branch?: Branch; viewer?: PortalUser & { ownRank?: number | null }; leaderboardVisibility?: 'own' | 'rank' | 'full' };

export const demoMode = import.meta.env.DEV && import.meta.env.MODE === 'development' && import.meta.env.VITE_DEMO_MODE === 'true';
const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const dashboardTokenKey = 'salesboard-dashboard-session';
const adminTokenKey = 'salesboard-admin-session';
const userTokenKey = 'salesboard-user-session';

function storedToken(key: string) {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
}

function rememberLogin(path: string, data: unknown) {
  if (typeof sessionStorage === 'undefined' || !data || typeof data !== 'object' || !('token' in data) || typeof data.token !== 'string') return;
  if (path === '/api/login') {
    sessionStorage.removeItem(userTokenKey);
    sessionStorage.setItem(dashboardTokenKey, data.token);
  }
  if (path === '/api/admin/login') sessionStorage.setItem(adminTokenKey, data.token);
  if (path === '/api/user/login') {
    sessionStorage.removeItem(dashboardTokenKey);
    sessionStorage.removeItem(adminTokenKey);
    sessionStorage.setItem(userTokenKey, data.token);
  }
}

function forgetSessions() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(dashboardTokenKey);
  sessionStorage.removeItem(adminTokenKey);
  sessionStorage.removeItem(userTokenKey);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (demoMode) throw new Error('Demo način ne koristi bazu.');
  const dashboardToken = storedToken(dashboardTokenKey);
  const adminToken = storedToken(adminTokenKey);
  const userToken = storedToken(userTokenKey);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(dashboardToken ? { 'x-salesboard-session': dashboardToken } : {}),
      ...(adminToken ? { 'x-salesboard-admin-session': adminToken } : {}),
      ...(userToken ? { 'x-salesboard-user-session': userToken } : {}),
      ...init?.headers
    }
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('API trenutno nije dostupan.');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Došlo je do pogreške.');
  rememberLogin(path, data);
  if (path === '/api/logout') forgetSessions();
  if (path === '/api/user/logout' && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(userTokenKey);
  return data as T;
}
