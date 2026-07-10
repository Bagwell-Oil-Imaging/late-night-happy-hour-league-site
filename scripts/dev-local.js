/**
 * Starts the Vite app and local API server together for `make run`.
 * Stops both child processes when this supervisor receives Ctrl+C or SIGTERM.
 */

import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev:api'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npm, ['run', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(exitCode);
}

for (const child of children) {
  child.on('error', error => {
    console.error('[dev:local] Failed to start development process:', error);
    stop(1);
  });
  child.on('exit', code => {
    if (!stopping) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
