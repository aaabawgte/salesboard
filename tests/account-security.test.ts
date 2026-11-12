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

});
