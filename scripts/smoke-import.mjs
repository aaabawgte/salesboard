import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const [filePath, baseUrl] = process.argv.slice(2);
if (!filePath || !baseUrl) {
  console.error('Usage: node scripts/smoke-import.mjs FILE URL < password');
  process.exit(1);
}
const base = baseUrl.replace(/\/+$/, '');
let password = '';
for await (const chunk of process.stdin) password += chunk;
const login = execFileSync('curl', ['-sS', '-i', '-X', 'POST', `${base}/api/admin/login`, '-H', 'content-type: application/json', '--data-binary', '@-'], { input: JSON.stringify({ password: password.trim() }), encoding: 'utf8' });
const loginCode = Number([...login.matchAll(/^HTTP\/\S+ (\d+)/gm)].at(-1)?.[1]);
console.log('Admin prijava:', loginCode);
if (loginCode !== 200) { console.log(login.slice(-400)); process.exit(1); }
const cookie = login.match(/^set-cookie: (sb_admin=[^;\r\n]+)/mi)?.[1];
if (!cookie) { console.error('Nedostaje administratorska sesija.'); process.exit(1); }
const upload = execFileSync('curl', ['-sS', '-i', '-X', 'POST', `${base}/api/import`, '-H', `Cookie: ${cookie}`, '-F', `file=@${filePath};filename=${basename(filePath)};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const uploadCode = Number([...upload.matchAll(/^HTTP\/\S+ (\d+)/gm)].at(-1)?.[1]);
console.log('Uvoz:', uploadCode);
console.log(upload.slice(upload.lastIndexOf('\r\n\r\n') + 4).slice(0, 2000));
if (uploadCode !== 200 && uploadCode !== 409) process.exitCode = 1;
