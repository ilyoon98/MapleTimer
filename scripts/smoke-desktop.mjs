// Own app only: isolated profile, loopback debugging, no game/monitor capture.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import electron from 'electron';
const root = process.cwd();
await fs.mkdir('release', { recursive: true });
const packaged = process.argv.includes('--packaged');
const executable = packaged ? path.join(root, 'release/win-unpacked/MapleTimer Personal.exe') : electron;
const child = spawn(executable, [...(packaged ? [] : ['.']), '--remote-debugging-port=9333', '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${path.join(root, 'release', process.argv.includes('--fresh-profile') ? 'smoke-profile-'+Date.now() : 'smoke-profile')}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stderr.on('data', d => { logs += d; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let closeApp;
try {
  let target;
  for (let i = 0; i < 60; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9333/json/list')).json()).find(t => t.url === 'app://maple/'); } catch {}
    if (target) break;
    await delay(250);
  }
  if (!target) throw new Error('App did not load: ' + logs);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const data = JSON.parse(event.data);
    const request = pending.get(data.id);
    if (request) { pending.delete(data.id); data.error ? request.reject(data.error) : request.resolve(data.result); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(key, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  closeApp = () => evaluate('window.close()').catch(() => {});
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`document.querySelectorAll('.panel').length > 0`)) break;
    await delay(250);
  }
  const initial = await evaluate(`({title:document.title,bridge:!!window.mapleDesktop, node:typeof require, panels:document.querySelectorAll('.panel').length, expanded:document.querySelectorAll('details.compact-settings[open]').length})`);
  if (!initial.bridge || initial.node !== 'undefined' || initial.panels < 1) throw new Error('Bad shell: ' + JSON.stringify(initial));
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='메이플 연결').click()`);
  await delay(2000);
  const picker = await evaluate(`({open:!!document.querySelector('[aria-label="메이플 연결"]'), sources:document.querySelectorAll('.capture-sources button').length,error:document.querySelector('[role=alert]')?.textContent})`);
  if (!picker.open || picker.error) throw new Error('Picker failed: ' + JSON.stringify(picker));
  const png = await call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile('release/desktop-smoke.png', Buffer.from(png.data, 'base64'));
  let capture = 'not requested';
  if (process.argv.includes('--capture-game')) {
    const hasGame = await evaluate(`[...document.querySelectorAll('.capture-sources button')].some(b=>b.textContent.trim()==='추천 · MapleStory')`);
    if (!hasGame) throw new Error('No exact MapleStory game source; refusing monitor fallback');
    await evaluate(`[...document.querySelectorAll('.capture-sources button')].find(b=>b.textContent.trim()==='추천 · MapleStory').click(); document.querySelector('[aria-label="메이플 연결"] .primary').click()`);
    await delay(4000);
    capture = await evaluate(`({live:!!document.querySelector('.share-live'),text:document.querySelector('.share-chip')?.innerText, error:document.querySelector('[role=alert]')?.textContent})`);
    if (!capture.live || capture.error) throw new Error('Game capture failed: ' + JSON.stringify(capture));
    if (process.argv.includes('--inspect-frame')) {
      await delay(11000);
      console.log('Auto setup:', await evaluate(`[...document.querySelectorAll('.panel')].filter(p=>/룬 알림|부스터/.test(p.querySelector('h2')?.textContent||'')).map(p=>p.innerText.slice(0,300))`));
      await evaluate(`[...document.querySelectorAll('.share-live button')].find(b=>b.textContent==='게임 영역').click()`);
      await delay(500);
      const data = await evaluate(`document.querySelector('.picker-canvas-wrap canvas').toDataURL('image/png')`);
      await fs.writeFile('release/game-frame.png', Buffer.from(data.split(',')[1], 'base64'));
      const { build } = await import('esbuild');
      const bundle = await build({entryPoints:['src/detect/autoRegions.ts'],bundle:true,format:'iife',globalName:'AutoRegions',write:false});
      console.log('Minimap candidate:', await evaluate(bundle.outputFiles[0].text + `; AutoRegions.findMinimap(document.querySelector('.picker-canvas-wrap canvas').getContext('2d').getImageData(1,31,600,450))`));
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    }
    await evaluate(`[...document.querySelectorAll('.share-live button')].find(b=>b.textContent==='중지').click()`);
  } else await evaluate(`document.querySelector('[aria-label="메이플 연결"] button').click()`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='PIP 타이머').click()`);
  await delay(1500);
  const popup = await evaluate(`({open:!!window.open('about:blank','maple-overlay').document.querySelector('.pip')})`);
  if (!popup.open) throw new Error('Overlay failed');
  console.log(JSON.stringify({ initial, picker, popup, capture, screenshot: path.join(root, 'release/desktop-smoke.png') }, null, 2));
} finally {
  if (closeApp) await Promise.race([closeApp(), delay(1000)]);
  ws?.close();
  child.kill();
  await fs.writeFile('release/desktop-smoke.log', logs);
}
