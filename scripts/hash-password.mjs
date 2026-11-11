import { pbkdf2Sync, randomBytes } from 'node:crypto';
const password = process.argv[2];
if (!password) { console.error('Usage: npm run hash-password -- "lozinka"'); process.exit(1); }
// Cloudflare Workers WebCrypto supports PBKDF2 up to 100,000 iterations.
const iterations = 100000;
const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
console.log(`pbkdf2$sha256$${iterations}$${salt.toString('base64')}$${derived.toString('base64')}`);
