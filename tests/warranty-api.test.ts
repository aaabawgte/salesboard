import { describe, expect, it } from 'vitest';
import { handlePortalRequest } from '../worker/portal';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});
const bad = (message: string, status = 400) => json({ error: message }, status);
const helpers = { json, bad, requireAdmin: async () => false };
const activeUser = {
  id: 1,
  username: 'test.korisnik',
  display_name: 'Test Korisnik',
  role: 'manager',
  status: 'active',
  branch_id: 1,
  branch_code: 'CCOW',
  branch_name: 'Big Bang Zagreb CCO West',
  employee_id: 1,
  leaderboard_visibility: 'own'
};
const DB = {
  prepare() {
    return {
      bind() {
        return { first: async () => activeUser };
      }
    };
  }
};

describe('warranty calculator API', () => {
  it.each([
    ['POST', '/api/warranties'],
    ['GET', '/api/warranties'],
    ['GET', '/api/manage/warranties?month=2026-11']
  ])('does not expose removed persistence route %s %s', async (method, path) => {
    const response = await handlePortalRequest(new Request(`https://salesboard.example${path}`, {
      method,
      headers: { 'x-salesboard-user-session': 'session-token' }
    }), { DB }, helpers);

    expect(response).toBeNull();
  });
});
