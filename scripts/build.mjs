import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundleWorker } from 'esbuild';
import { build as buildClient } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const client = join(dist, 'client');

rmSync(dist, { recursive: true, force: true });
await buildClient({ root });

const files = readdirSync(client, { recursive: true, withFileTypes: true });
const assets = Object.fromEntries(files.filter(file => file.isFile()).map(file => {
  const path = join(file.parentPath, file.name);
  const url = `/${relative(client, path).split(sep).join('/')}`;
  return [url, readFileSync(path, 'utf8')];
}));

await bundleWorker({
  absWorkingDir: root,
  entryPoints: ['worker/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  mainFields: ['browser', 'module', 'main'],
  define: { __SALESBOARD_ASSETS__: JSON.stringify(assets) },
  outfile: 'dist/server/index.js'
});

const manifest = join(root, '.openai', 'hosting.json');
if (existsSync(manifest)) {
  mkdirSync(join(dist, '.openai'), { recursive: true });
  cpSync(manifest, join(dist, '.openai', 'hosting.json'));
}
cpSync(join(root, 'migrations'), join(dist, 'drizzle'), { recursive: true });
console.log('Built Cloudflare Worker bundle in dist/server/index.js');
