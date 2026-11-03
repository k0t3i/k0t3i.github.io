// Runs html-validate and the Nu HTML checker (vnu, --Werror) on the pages that exist.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['../index.html', '../en/index.html', '../404.html'].filter((p) => existsSync(resolve(dev, p)));

if (pages.length === 0) {
  console.log('validate: no page exists yet, nothing to check.');
  process.exit(0);
}

const config = existsSync(resolve(dev, '.htmlvalidate.json')) ? ['--config', '.htmlvalidate.json'] : [];
const run = (cmd, args) => spawnSync(cmd, args, { cwd: dev, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' });

const hv = run('npx', ['html-validate', ...config, ...pages]);
const vnu = run('java', ['-jar', 'node_modules/vnu-jar/build/dist/vnu.jar', '--Werror', ...pages]);

process.exit(hv.status === 0 && vnu.status === 0 ? 0 : 1);
