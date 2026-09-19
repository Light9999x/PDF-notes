import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const launcher = path.join(root, 'scripts', 'preview.mjs');
const stateFile = path.join(root, '.runtime', 'preview.json');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check) {
  for (let n = 0; n < 100; n++) { if (await check()) return; await pause(100); }
  throw new Error('Timed out waiting for server state');
}
async function open() {
  return new Promise(resolve => {
    const s = createConnection({ host: '127.0.0.1', port: 4173 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => { s.destroy(); resolve(false); });
  });
}
function run(command, args) {
  const child = spawn(command, args, { cwd: path.dirname(root.replace(/[\\/]$/, '')), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
  return { child, done, output: () => output };
}
async function complete(task) {
  let timer;
  try { return await Promise.race([task.done, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(task.output() || 'Process did not exit')), 10000); })]); }
  finally { clearTimeout(timer); }
}
async function launch(t, powershell = false) {
  assert.equal(await open(), false, '4173 is occupied; do not stop an existing user service');
  const task = powershell ? run('powershell.exe', ['-NoProfile', '-File', path.join(root, 'start-pdfnote.ps1')]) : run(process.execPath, [launcher]);
  t.after(async () => {
    task.child.stdin.end();
    try { await complete(task); } catch { task.child.kill(); }
  });
  await waitFor(async () => {
    if (task.child.exitCode !== null) throw new Error(task.output());
    try { await fs.access(stateFile); return await open(); } catch { return false; }
  });
  return task;
}

test('Ctrl+C input closes the actual preview listener and cleans up its state', async t => {
  const task = await launch(t);
  const response = await fetch('http://127.0.0.1:4173/');
  assert.equal(response.status, 200);
  task.child.stdin.write('\x03');
  assert.equal(await complete(task), 0, task.output());
  assert.equal(await open(), false);
  await assert.rejects(fs.access(stateFile));
});

test('cross-directory PowerShell start/stop work; repeated stop is safe', { skip: process.platform !== 'win32' }, async t => {
  const server = await launch(t, true);
  const stopped = run('powershell.exe', ['-NoProfile', '-File', path.join(root, 'stop-pdfnote.ps1')]);
  assert.equal(await complete(stopped), 0, stopped.output());
  assert.equal(await complete(server), 0, server.output());
  assert.equal(await open(), false);
  const again = run(process.execPath, [launcher, '--stop']);
  assert.equal(await complete(again), 0, again.output());
});

test('closing the owning terminal input stops the server', async t => {
  const server = await launch(t);
  server.child.stdin.end();
  assert.equal(await complete(server), 0, server.output());
  assert.equal(await open(), false);
});

test('control requests without the token cannot stop the service; duplicate launch leaves it intact', async t => {
  const server = await launch(t);
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  const denied = await fetch(`http://127.0.0.1:${state.controlPort}/stop`, { method: 'POST' });
  assert.equal(denied.status, 403);
  const duplicate = run(process.execPath, [launcher]);
  assert.equal(await complete(duplicate), 1);
  assert.equal((JSON.parse(await fs.readFile(stateFile, 'utf8'))).token, state.token);
  assert.equal(await open(), true);
  const stopped = run(process.execPath, [launcher, '--stop']);
  assert.equal(await complete(stopped), 0, stopped.output());
  assert.equal(await complete(server), 0);
});

test('an unrelated listener on 4173 is reported and never terminated', async t => {
  assert.equal(await open(), false);
  const other = createServer((_, res) => res.end('other service'));
  await new Promise(resolve => other.listen(4173, '127.0.0.1', resolve));
  t.after(() => { other.closeAllConnections(); other.close(); });
  const stopped = run(process.execPath, [launcher, '--stop']);
  assert.equal(await complete(stopped), 1);
  assert.equal(await (await fetch('http://127.0.0.1:4173/')).text(), 'other service');
});
