const { app, BrowserWindow, desktopCapturer, ipcMain, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { sortSources } = require('./sources.cjs');
const ORIGIN = 'app://maple';
const root = path.resolve(__dirname, '../dist');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.setName('메이플 타이머 개인용');
let main;
let selected = null;
const children = new Set();
const trusted = (event) => event.sender === main?.webContents && event.senderFrame === main.webContents.mainFrame
  && event.senderFrame.url === `${ORIGIN}/`;
const sources = () => desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 240, height: 135 } });
const ownIds = () => new Set(BrowserWindow.getAllWindows().map(w => w.getMediaSourceId().split(':').slice(0, 2).join(':')));

app.whenReady().then(async () => {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    if (url.host !== 'maple' || !['GET', 'HEAD'].includes(req.method)) return new Response(null, { status: 403 });
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); }
    catch { return new Response(null, { status: 400 }); }
    if (!file.startsWith(root + path.sep)) return new Response(null, { status: 403 });
    try {
      const data = await fs.readFile(file);
      return new Response(req.method === 'HEAD' ? null : data, { headers: {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self'; font-src 'self' data:",
      } });
    } catch { return new Response(null, { status: 404 }); }
  });
  ipcMain.handle('capture:list', async (event) => {
    if (!trusted(event)) throw new Error('허용되지 않은 요청');
    const own = ownIds();
    return sortSources((await sources()).filter(s => !own.has(s.id.split(':').slice(0, 2).join(':'))))
      .map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), recommended: require('./sources.cjs').score(s.name) > 0 }));
  });
  ipcMain.handle('capture:select', async (event, id) => {
    if (!trusted(event) || typeof id !== 'string') throw new Error('허용되지 않은 요청');
    const found = (await sources()).find(s => s.id === id && !ownIds().has(s.id.split(':').slice(0, 2).join(':')));
    if (!found) throw new Error('선택한 창이 닫혔어요. 다시 선택해 주세요.');
    selected = found.id;
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === main?.webContents && permission === 'display-capture');
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
    callback(contents === main?.webContents && contents.getURL() === `${ORIGIN}/` && permission === 'display-capture'));
  session.defaultSession.setDisplayMediaRequestHandler(async (req, callback) => {
    const id = selected;
    selected = null;
    const frame = main?.webContents.mainFrame;
    if (!frame || req.frame?.processId !== frame.processId || req.frame?.routingId !== frame.routingId
      || req.frame?.url !== `${ORIGIN}/` || !id) { callback({}); return; }
    try {
      const source = (await sources()).find(s => s.id === id);
      callback(source ? { video: source } : {});
    } catch { callback({}); }
  });
  main = new BrowserWindow({ width: 1120, height: 820, minWidth: 720, minHeight: 500, title: '메이플 타이머 개인용',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  main.setMenuBarVisibility(false);
  main.webContents.on('will-navigate', (event, url) => { if (url !== `${ORIGIN}/`) event.preventDefault(); });
  main.webContents.setWindowOpenHandler(({ url, frameName }) => url === 'about:blank' && frameName === 'maple-overlay'
    ? { action: 'allow', overrideBrowserWindowOptions: { title: '메이플 타이머', alwaysOnTop: true, autoHideMenuBar: true, minWidth: 220, minHeight: 180,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } } }
    : { action: 'deny' });
  main.webContents.on('did-create-window', child => {
    children.add(child);
    child.setAlwaysOnTop(true, 'floating');
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', event => event.preventDefault());
    child.on('closed', () => children.delete(child));
  });
  main.on('closed', () => { for (const child of children) child.destroy(); main = null; });
  await main.loadURL(`${ORIGIN}/`);
});
app.on('window-all-closed', () => app.quit());
