import { execFileSync } from 'node:child_process';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node scripts/smoke-analytics.mjs URL < password');
  process.exit(1);
}
const base = baseUrl.replace(/\/+$/, '');
let password = '';
for await (const chunk of process.stdin) password += chunk;
const login = execFileSync('curl', ['-sS', '-i', '-X', 'POST', `${base}/api/login`, '-H', 'content-type: application/json', '--data-binary', '@-'], { input: JSON.stringify({ password: password.trim() }), encoding: 'utf8' });
const code = Number([...login.matchAll(/^HTTP\/\S+ (\d+)/gm)].at(-1)?.[1]);
if (code !== 200) { console.error('Prijava:', code); process.exit(1); }
const cookie = login.match(/^set-cookie: (sb_session=[^;\r\n]+)/mi)?.[1];
if (!cookie) { console.error('Nedostaje sesija.'); process.exit(1); }
const result = execFileSync('curl', ['-sS', '-H', `Cookie: ${cookie}`, `${base}/api/analytics?from=2026-11-01&to=2026-11-09`], { encoding: 'utf8' });
const data = JSON.parse(result);
console.log(JSON.stringify({ totalCents: data.totalCents, quantity: data.quantity, employees: data.leaderboard.map(({ name, cents }) => ({ name, cents })) }, null, 2));
