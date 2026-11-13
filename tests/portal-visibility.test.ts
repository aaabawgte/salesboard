import { describe, expect, it } from 'vitest';
import { handlePortalRequest } from '../worker/portal';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});
const bad = (message: string, status = 400) => json({ error: message }, status);
const helpers = { json, bad, requireAdmin: async () => false };

describe('portal result visibility', () => {
  it('keeps branch aggregates while returning only the employee row with its real rank', async () => {
    const user = {
      id: 2,
      username: 'drugi.djelatnik',
      display_name: 'Drugi Djelatnik',
      role: 'employee',
      status: 'active',
      branch_id: 1,
      branch_code: 'CCOW',
      branch_name: 'Big Bang Zagreb CCO West',
      employee_id: 2,
      leaderboard_visibility: 'rank'
    };
    const sales = [
      { date: '2026-11-01', quantity: 10, cents: 10_000, employee_id: 1, employee: 'Prvi Djelatnik' },
      { date: '2026-11-01', quantity: 5, cents: 5_000, employee_id: 2, employee: 'Drugi Djelatnik' },
      { date: '2026-11-02', quantity: 2, cents: 2_000, employee_id: 3, employee: 'Treći Djelatnik' }
    ];
    const DB = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              all: async () => ({ results: sql.includes('FROM sales_daily s JOIN employees') ? sales : [] }),
              first: async () => {
                if (sql.includes('FROM user_sessions')) return user;
                if (sql.includes('FROM monthly_targets')) return { working_days_total: 22, warranty_target_cents: 50_000 };
                if (sql.includes('SUM(value_cents)') && sql.includes('FROM sales_daily')) return { cents: 17_000 };
                return null;
              }
            };
          }
        };
      }
    };

    const response = await handlePortalRequest(new Request('https://salesboard.example/api/portal/analytics?from=2026-11-01&to=2026-11-30', {
      headers: { 'x-salesboard-user-session': 'session-token' }
    }), { DB }, helpers);
    const body: any = await response?.json();

    expect(response?.status).toBe(200);
    expect(body.totalCents).toBe(17_000);
    expect(body.target).toMatchObject({ configured: true, targetCents: 50_000, achievedCents: 17_000, remainingCents: 33_000, progress: 0.34 });
    expect(body.quantity).toBe(17);
    expect(body.daily).toEqual([
      { date: '2026-11-01', quantity: 15, cents: 15_000, value: 150 },
      { date: '2026-11-02', quantity: 2, cents: 2_000, value: 20 }
    ]);
    expect(body.rows).toHaveLength(1);
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0]).toMatchObject({ id: 2, rank: 2, name: 'Drugi Djelatnik' });
    expect(body.viewer.ownRank).toBe(2);
  });
});
