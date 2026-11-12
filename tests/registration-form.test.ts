import { describe, expect, it } from 'vitest';
import { handlePortalRequest } from '../worker/portal';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});
const bad = (message: string, status = 400) => json({ error: message }, status);
const helpers = { json, bad, requireAdmin: async () => false };

describe('registration transport', () => {
  it('redirects a native browser form error back to GitHub Pages', async () => {
    const body = new URLSearchParams({
      username: 'test.korisnik',
      displayName: 'Test Korisnik',
      password: 'kratko',
      branchId: '9',
      role: 'employee'
    });
    const response = await handlePortalRequest(
      new Request('https://salesboard.example/api/register/form', { method: 'POST', body }),
      { DB: {} },
      helpers
    );

    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toContain('https://aaabawgte.github.io/salesboard/');
    expect(response?.headers.get('location')).toContain('registrationError=');
  });

  it('keeps JSON registration validation for API clients', async () => {
    const response = await handlePortalRequest(
      new Request('https://salesboard.example/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'test.korisnik', displayName: 'Test Korisnik', password: 'kratko', branchId: 9 })
      }),
      { DB: {} },
      helpers
    );

    expect(response?.status).toBe(422);
    await expect(response?.json()).resolves.toEqual({ error: 'Lozinka mora imati najmanje 8 znakova.' });
  });
});
