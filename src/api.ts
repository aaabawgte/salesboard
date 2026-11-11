export type Employee = { id: number; name: string; quantity: number; cents: number; value: number; rank: number; avg: number | null; share: number | null; days: Array<{ date: string; quantity: number; cents: number; value: number }> };
export type Analytics = { from: string; to: string; totalCents: number; total: number; quantity: number; leaderboard: Employee[]; employees: Employee[]; daily: Array<{ date: string; quantity: number; cents: number; value: number }>; rows: Array<{ date: string; employee: string; employee_id: number; quantity: number; cents: number; value: number }>; latestImport: { imported_at: string; file_name: string } | null };

export const demoMode = import.meta.env.DEV && import.meta.env.MODE === 'development' && import.meta.env.VITE_DEMO_MODE === 'true';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (demoMode) throw new Error('Demo način ne koristi bazu.');
  const response = await fetch(path, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Došlo je do pogreške.');
  return data as T;
}
