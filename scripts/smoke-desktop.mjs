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
  if (process.argv.includes('--check-persistence')) {
    const expected=JSON.parse(await fs.readFile('package.json','utf8')).version;
    const info=await evaluate(`window.mapleDesktop.appInfo()`);
    if(info.version!==expected)throw new Error('Wrong native app version: '+JSON.stringify(info));
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.title.startsWith('화면 테마 바꾸기')).click()`);
    const saved=await evaluate(`JSON.parse(window.mapleDesktop.settings.read('maple-timer-personal.profile.v1').value).theme`);
    if(saved!=='dark')throw new Error('Theme was not immediately saved: '+saved);
    // 브라우저 설정이 비어도 앱 파일에서 돌아와야 한다. 300ms 저장 대기는 하지 않는다.
    await evaluate(`localStorage.removeItem('maple-timer-personal.profile.v1')`);
    await call('Page.reload');await delay(1000);
    const restored=await evaluate(`({theme:document.documentElement.dataset.theme,version:document.querySelector('.app-head .app-version')?.textContent,error:document.querySelector('[role=alert]')?.textContent})`);
    if(restored.theme!=='dark'||restored.version!=='v'+expected||restored.error)throw new Error('Settings did not survive reload: '+JSON.stringify(restored));
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='설정').click()`);
    const updateButton=await evaluate(`[...document.querySelectorAll('.modal button')].some(b=>b.textContent==='업데이트 확인')`);
    if(!updateButton)throw new Error('No manual update check');
    await evaluate(`document.querySelector('.modal [aria-label="닫기"]').click()`);
    console.log('Version and persistent settings:',JSON.stringify({info,saved,restored,updateButton}));
  }
  if (process.argv.includes('--check-evidence')) {
    // 실제 게임 대신 고정 그림을 주입한다. 별도 프로필에서 브라우저의 PNG/JPEG 인코딩,
    // IndexedDB 보관, 설정 화면의 캡처 열람까지 검사한다.
    const { build } = await import('esbuild');
    const bundle = await build({stdin:{contents:`
      export { startAlertEvidence,flushAlertEvidence } from './src/engine/alertEvidence';
      export { exportAlertEvidence } from './src/state/alertEvidence';
      export { profileStore } from './src/state/profile';
      export { liveStore } from './src/engine/live';
      export { AlertRunner } from './src/alerts/alertRunner';
      export { audioEngine } from './src/alerts/audio';`,resolveDir:root},
      bundle:true,format:'iife',globalName:'EvidenceSmoke',write:false,
      define:{'import.meta.env.DEV':'false'},
      plugins:[{name:'synthetic-capture',setup(b){
        b.onResolve({filter:/capture\/screenCapture$/},()=>({path:'synthetic',namespace:'evidence'}));
        b.onLoad({filter:/.*/,namespace:'evidence'},()=>({contents:'export const screenCapture = window.__evidenceCapture;'}));
      }}]});
    await evaluate(`(()=>{
      const c=document.createElement('canvas');c.width=800;c.height=600;
      const ctx=c.getContext('2d');ctx.fillStyle='#152530';ctx.fillRect(0,0,800,600);ctx.fillStyle='#ffcc00';ctx.font='40px monospace';ctx.fillText('10.00',310,120);
      window.__evidenceCapture={state:'live',width:800,height:600,sessionId:9,frameId:22,drawnAt:1000,snapshot:()=>c,crop:r=>ctx.getImageData(r.x,r.y,r.w,r.h)};
    })()`);
    await evaluate(bundle.outputFiles[0].text);
    const evidence = await evaluate(`(async()=>{
      EvidenceSmoke.audioEngine.muted=true;
      EvidenceSmoke.profileStore.set(p=>({...p,muted:true,regions:{...p.regions,booster:{x:300,y:80,w:230,h:65,frameW:800,frameH:600}}}));
      EvidenceSmoke.startAlertEvidence();
      const runner=new EvidenceSmoke.AlertRunner('부스터',()=>({sound:{kind:'beep',pattern:'single'},volume:1,repeat:{enabled:false,intervalSec:3,maxCount:1}}),'booster');
      runner.trigger(1000);runner.tick(1000);
      EvidenceSmoke.liveStore.set({booster:{status:'running',readText:'10',endsAt:11500,lastAlertAt:1000}});
      await EvidenceSmoke.flushAlertEvidence();
      const entries=await EvidenceSmoke.exportAlertEvidence();
      const entry=entries[0];
      return {count:entries.length,key:entry?.key,text:entry?.live.booster.readText,frame:entry?.frame?.startsWith('data:image/jpeg'),crop:entry?.crop?.image?.startsWith('data:image/png'),frameId:entry?.frameId};
    })()`);
    if(evidence.count!==1||evidence.key!=='booster'||evidence.text!=='10'||!evidence.frame||!evidence.crop||evidence.frameId!==22)throw new Error('Alert capture failed: '+JSON.stringify(evidence));
    await call('Page.reload');await delay(1000);
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='설정').click()`);
    await delay(100);
    await evaluate(`document.querySelector('details.modal-advanced').open=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='알림 캡처 보기').click()`);
    await delay(500);
    const viewer = await evaluate(`({cards:document.querySelectorAll('.alert-evidence').length,images:[...document.querySelectorAll('.evidence-crop')].every(i=>i.complete&&i.naturalWidth>0)})`);
    if(viewer.cards!==1||!viewer.images)throw new Error('Saved alert capture not displayed: '+JSON.stringify(viewer));
    await evaluate(`document.querySelector('.modal [aria-label="닫기"]').click()`);
    console.log('Alert evidence:',JSON.stringify({evidence,viewer}));
  }
  if (process.argv.includes('--check-settings')) {
    const rows = await evaluate(`(() => {
      const panel = [...document.querySelectorAll('.panel')].find(p=>p.querySelector('h2')?.textContent==='스킬 알림');
      panel.querySelectorAll('details').forEach(d=>d.open=true);
      return [...panel.querySelectorAll('.row-title')].map(r=>r.textContent);
    })()`);
    if (rows.length !== 2 || !rows[0].includes('솔 야누스') || !rows[1].includes('에르다 파운틴')) throw new Error('Unexpected skills: '+JSON.stringify(rows));
    await evaluate(`document.querySelectorAll('select[aria-label$=" 감지 위치"]').forEach(s=>{s.value='favorites';s.dispatchEvent(new Event('change',{bubbles:true}));})`);
    await delay(100);
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="즐겨찾기 위치 (두 스킬 공통)"]');s.value='left';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await delay(100);
    const shared = await evaluate(`({positions:[...document.querySelectorAll('select[aria-label="즐겨찾기 위치 (두 스킬 공통)"]')].map(s=>s.value),picker:!!document.querySelector('.picker-stage')})`);
    if (shared.positions.length !== 2 || shared.positions.some(p=>p!=='left') || shared.picker) throw new Error('Favorites needs a rectangle: '+JSON.stringify(shared));
    await evaluate(`(()=>{
      const row=document.querySelector('.panel .row');
      const groups=row.querySelectorAll('.alert-group');
      const lead=groups[0].querySelectorAll('select')[0];lead.value='5';lead.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await delay(100);
    await evaluate(`(()=>{
      const row=document.querySelector('.panel .row');
      const sound=row.querySelectorAll('.alert-group')[1].querySelector('select');sound.value='beep:double';sound.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await delay(400);
    const saved = await evaluate(`(()=>{const p=JSON.parse(localStorage.getItem('maple-timer-personal.profile.v1'));return {position:p.favoritesPosition,lead:p.skills[0].leadSec,sound:p.skills[0].alert.sound.kind,groups:[...document.querySelector('.panel .row').querySelectorAll('legend')].map(l=>l.textContent)};})()`);
    if (saved.position !== 'left' || saved.lead !== 5 || saved.sound !== 'beep' || saved.groups.join(',') !== '알림,소리') throw new Error('Settings did not persist: '+JSON.stringify(saved));
    const boosterButtons = await evaluate(`[...document.querySelectorAll('.panel')].find(p=>p.querySelector('h2')?.textContent==='부스터 종료 알림').querySelectorAll('.row-main button').length`);
    if (boosterButtons) throw new Error('Booster still needs manual setup');
    const settingsPng = await call('Page.captureScreenshot', { format:'png' });
    await fs.writeFile('release/settings-smoke.png', Buffer.from(settingsPng.data,'base64'));
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='높이 조정').click()`);
    const heightPicker = await evaluate(`({title:document.querySelector('.modal h3')?.textContent,help:document.querySelector('.modal .guide-list')?.textContent})`);
    if (heightPicker.title !== '경험치 숫자 높이 선택' || !heightPicker.help?.includes('중앙 40%')) throw new Error('Wrong height picker: '+JSON.stringify(heightPicker));
    await evaluate(`document.querySelector('.modal [aria-label="닫기"]').click()`);
    console.log('Simplified settings:', JSON.stringify({rows,shared,saved,heightPicker}));
  }
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
