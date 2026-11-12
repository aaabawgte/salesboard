import { describe, expect, it } from 'vitest';
import { handlePortalRequest, hashPassword } from '../worker/portal';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});
const bad = (message: string, status = 400) => json({ error: message }, status);
const helpers = { json, bad, requireAdmin: async () => false };

describe('account security', () => {
  it('changes an authenticated user password only when the current password matches', async () => {
    let passwordHash = await hashPassword('test1234');
    const activeUser = {
      id: 7,
      username: 'marko.primjer',
      display_name: 'Marko Primjer',
      role: 'manager',
      status: 'active',
      branch_id: 1,
      branch_code: 'CCOW',
      branch_name: 'Big Bang Zagreb CCO West',
      employee_id: 7,
      leaderboard_visibility: 'own'
    };
    const DB = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              first: async () => sql.includes('FROM user_sessions') ? activeUser : sql.startsWith('SELECT password_hash') ? { password_hash: passwordHash } : null,
              run: async () => {
                if (sql.startsWith('UPDATE users SET password_hash')) passwordHash = String(values[0]);
                return { success: true };
              }
            };
          }
        };
      }
    };
    const originalHash = passwordHash;
    const changed = await handlePortalRequest(new Request('https://salesboard.example/api/user/password', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-salesboard-user-session': 'session-token' },
      body: JSON.stringify({ currentPassword: 'test1234', newPassword: 'nova-lozinka-123' })
    }), { DB }, helpers);

    expect(changed?.status).toBe(200);
    expect(passwordHash).not.toBe(originalHash);

    const rejected = await handlePortalRequest(new Request('https://salesboard.example/api/user/password', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-salesboard-user-session': 'session-token' },
      body: JSON.stringify({ currentPassword: 'test1234', newPassword: 'druga-lozinka-123' })
    }), { DB }, helpers);
    expect(rejected?.status).toBe(401);
  });

  it('keeps bulk setup unavailable when its one-time secret is absent', async () => {
    const response = await handlePortalRequest(new Request('https://salesboard.example/api/internal/bulk-users', { method: 'POST' }), { DB: {} }, helpers);
    expect(response).toBeNull();
  });

  it('activates bulk users and links reversed or previously missing employee names', async () => {
    const employees: Array<{ id: number; display_name: string; normalized_key: string }> = [
      { id: 7, display_name: 'Primjer Marko', normalized_key: 'PRIMJER MARKO' }
    ];
    const users: Array<{ username: string; displayName: string; role: string; employeeId: number; passwordHash: string }> = [];
    const statements: Array<{ run: () => Promise<unknown> }> = [];
    const DB = {
      prepare(sql: string) {
        let values: unknown[] = [];
        const statement = {
          bind(...input: unknown[]) { values = input; return statement; },
          async first() {
            if (sql.includes("FROM branches WHERE code = 'CCOW'")) return { id: 1 };
            return null;
          },
          async all() {
            if (sql === 'SELECT id, normalized_key FROM employees') return { results: employees.map(({ id, normalized_key }) => ({ id, normalized_key })) };
            return { results: [] };
          },
          async run() {
            if (sql.startsWith('INSERT INTO employees')) {
              const displayName = String(values[0]);
              const normalizedKey = String(values[1]);
              if (!employees.some(employee => employee.normalized_key === normalizedKey)) employees.push({ id: employees.length + 8, display_name: displayName, normalized_key: normalizedKey });
            }
            if (sql.includes('INSERT INTO users')) users.push({ username: String(values[0]), displayName: String(values[1]), passwordHash: String(values[2]), role: String(values[3]), employeeId: Number(values[5]) });
            return { success: true };
          }
        };
        statements.push(statement);
        return statement;
      },
      async batch(batch: Array<{ run: () => Promise<unknown> }>) {
        for (const statement of batch) await statement.run();
        return [];
      }
    };
    const response = await handlePortalRequest(new Request('https://salesboard.example/api/internal/bulk-users', {
      method: 'POST',
      headers: { authorization: 'Bearer one-time-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        password: 'test1234',
        users: [
          { username: 'marko.primjer', displayName: 'Marko Primjer', role: 'manager' },
          { username: 'nova.osoba', displayName: 'Nova Osoba', role: 'employee' }
        ]
      })
    }), { DB, BULK_USER_SETUP_TOKEN: 'one-time-token' }, helpers);

    expect(response?.status).toBe(200);
    expect(users).toHaveLength(2);
    expect(users[0].employeeId).toBe(7);
    expect(users[1].employeeId).toBeGreaterThan(7);
    expect(users.every(user => user.passwordHash.startsWith('pbkdf2$sha256$100000$'))).toBe(true);
  });
});
