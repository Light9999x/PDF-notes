import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import readline from 'node:readline';

const root = await fs.realpath(fileURLToPath(new URL('..', import.meta.url)));
const stateFile = path.join(root, '.runtime', 'preview.json');
const host = '127.0.0.1';
const port = 4173;

async function portOpen() {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(800, () => done(true));
  });
}

async function removeOwnState(token) {
  try {
    const current = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    if (current.token === token) await fs.unlink(stateFile);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function stop() {
  let state;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (await portOpen()) throw new Error('4173 仍有未受此啟動器管理的服務。請回到啟動它的終端機或工具停止；未結束任何其他程序。');
    console.log('PDFnote 本機服務已停止（4173 無監聽）。仍開啟的離線 App／分頁請另外關閉。');
    return;
  }
  if (state.root !== root || !Number.isInteger(state.controlPort) || state.controlPort < 1 || state.controlPort > 65535 || !/^[a-f0-9-]{36}$/.test(state.token)) {
    throw new Error('啟動紀錄無效；未發送停止要求，也未結束任何程序。');
  }
  try {
    const response = await fetch(`http://${host}:${state.controlPort}/stop`, {
      method: 'POST', headers: { authorization: `Bearer ${state.token}` }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('本機服務未接受停止要求。');
    const ack = await response.json();
    if (ack.root !== root || ack.token !== state.token) throw new Error('服務識別不符。');
  } catch (error) {
    if (await portOpen()) throw new Error('無法確認停止目前的服務；沒有依 PID 或連接埠強制結束程序。' + error.message);
    await removeOwnState(state.token);
    console.log('PDFnote 本機服務已停止；已移除過期啟動紀錄。');
    return;
  }
  for (let n = 0; n < 40; n++) {
    if (!(await portOpen())) {
      await removeOwnState(state.token);
      console.log('PDFnote 本機服務已停止（4173 無監聽）。請另外關閉 App 視窗／分頁；離線快取與筆記已保留。');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('停止要求已送出，但 4173 仍有服務監聽；請檢查原啟動終端機。');
}

async function start() {
  await fs.access(path.join(root, 'dist', 'index.html'));
  process.chdir(root);
  const { preview } = await import('vite');
  const server = await preview({ root, preview: { host, port, strictPort: true } });
  const token = randomUUID();
  let input, stopping = false;
  const control = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/stop' || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end(); return;
    }
    res.setHeader('content-type', 'application/json');
    res.once('finish', () => { void shutdown(); });
    res.end(JSON.stringify({ root, token }));
  });
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    input?.close();
    process.stdin.pause();
    control.close();
    control.closeAllConnections();
    try {
      server.httpServer.closeAllConnections();
      await server.close();
      await removeOwnState(token);
      console.log('\nPDFnote 本機服務已停止。App 視窗／分頁需另外關閉；筆記與離線快取保留。');
      process.exit(0);
    } catch (error) { console.error(error.message); process.exit(1); }
  }
  try {
    await new Promise((resolve, reject) => {
      control.once('error', reject);
      control.listen(0, host, resolve);
    });
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify({ root, controlPort: control.address().port, token }), { mode: 0o600 });
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    // readline handles Windows console Ctrl+C; data handles piped terminals.
    if (process.stdin.isTTY) {
      input = readline.createInterface({ input: process.stdin, output: process.stdout });
      input.on('SIGINT', shutdown);
    } else {
      process.stdin.on('data', data => { if (data.includes(3)) void shutdown(); });
      process.stdin.resume();
    }
    process.stdin.on('end', shutdown);
    console.log(`PDFnote 已啟動：http://${host}:${port}/`);
    console.log('此終端機按 Ctrl+C 停止服務；也可在 app/ 執行 npm run stop，或執行 stop-pdfnote.ps1。');
    console.log('服務停止後，離線 PWA 仍可能顯示；請另外關閉視窗／分頁。');
  } catch (error) {
    control.close();
    await server.close();
    await removeOwnState(token);
    throw error;
  }
}

try { await (process.argv.includes('--stop') ? stop() : start()); }
catch (error) { console.error(error.message); process.exitCode = 1; }
