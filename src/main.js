// Electron main: floating window, tray, and the local event server.
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, desktopCapturer } = require('electron');
const { createStore } = require('./state');
const { startServer } = require('./server');
const { parseLine, isSwitch, isClaudeTerminal } = require('./switch');

const PORT = Number(process.env.COMPANION_PORT) || 7777;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win;
  let tray;
  let muted = false;
  let latest = null;
  let watcher;
  let prev = null; // latest foreground window sample
  let lastSweep = 0;
  const store = createStore();

  // Chat effect: snapshot the Claude terminal and hand it to the renderer, which plays the
  // team's move over it (letters knocked out, then restored). Only when a Claude Code tab
  // is the window in front, never over other apps or tabs.
  async function sweep(minGapMs) {
    if (!win || win.isDestroyed() || Date.now() - lastSweep < minGapMs || !isClaudeTerminal(prev)) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const r = prev.rect;
    const x0 = Math.max(r.x + 8, wa.x), y0 = Math.max(r.y + 40, wa.y); // skip window border + tab strip
    const x1 = Math.min(r.x + r.width - 8, wa.x + wa.width), y1 = Math.min(r.y + r.height - 8, wa.y + wa.height);
    if (x1 - x0 < 200 || y1 - y0 < 120) return; // terminal mostly off the primary screen
    lastSweep = Date.now();
    win.webContents.send('fx-hide'); // keep the character out of the snapshot
    await new Promise((res) => setTimeout(res, 120));
    try {
      const d = screen.getPrimaryDisplay();
      const sf = d.scaleFactor;
      const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: d.size.width * sf, height: d.size.height * sf } });
      const src = srcs.find((s) => s.display_id === String(d.id)) || srcs[0];
      const shot = src.thumbnail.crop({ x: Math.round((x0 - d.bounds.x) * sf), y: Math.round((y0 - d.bounds.y) * sf), width: Math.round((x1 - x0) * sf), height: Math.round((y1 - y0) * sf) });
      win.webContents.send('fx', { png: shot.toDataURL(), rect: { x: x0 - wa.x, y: y0 - wa.y, width: x1 - x0, height: y1 - y0 } });
    } catch {
      win.webContents.send('fx', null); // capture failed: just show the character again
    }
  }

  // Watches the foreground window; a window or browser-tab switch parks the character.
  function watchForeground() {
    watcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'foreground.ps1')], { windowsHide: true });
    watcher.on('error', () => {}); // no watcher → no auto-park, everything else still works
    readline.createInterface({ input: watcher.stdout }).on('line', (line) => {
      const next = parseLine(line);
      if (!next) return;
      if (isSwitch(prev, next) && win && !win.isDestroyed()) win.webContents.send('park');
      prev = next;
    });
  }

  function send(d) {
    if (d.mood === 'done' && !d.dim && (!latest || latest.mood !== 'done')) setTimeout(() => sweep(20000), 600); // celebrate a finished task
    latest = d;
    if (win && !win.isDestroyed()) win.webContents.send('display', d);
  }

  function trayIcon() {
    const n = 16;
    const buf = Buffer.alloc(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inside = (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 49;
        const i = (y * n + x) * 4;
        buf[i] = 238; buf[i + 1] = 211; buf[i + 2] = 34; buf[i + 3] = inside ? 255 : 0; // BGRA cyan
      }
    }
    return nativeImage.createFromBitmap(buf, { width: n, height: n });
  }

  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: 'Mute chime', type: 'checkbox', checked: muted, click: (i) => { muted = i.checked; win.webContents.send('mute', muted); } },
      { label: 'Hide/Show', click: () => (win.isVisible() ? win.hide() : win.showInactive()) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
  }

  app.on('second-instance', () => win && win.showInactive());

  app.whenReady().then(async () => {
    // A transparent, click-through layer over the whole primary screen; the character roams on it.
    win = new BrowserWindow({
      ...screen.getPrimaryDisplay().workArea,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      maximizable: false,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    // Clicks pass through except while the pointer is over the character (so it can be dragged).
    win.setIgnoreMouseEvents(true, { forward: true });
    ipcMain.on('interactive', (_e, on) => win.setIgnoreMouseEvents(!on, { forward: true }));
    ipcMain.on('quit', () => app.quit());
    ipcMain.on('sweep', () => sweep(2500)); // ring-menu button
    win.setAlwaysOnTop(true, 'screen-saver');
    screen.on('display-metrics-changed', () => win.setBounds(screen.getPrimaryDisplay().workArea));
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('mute', muted);
      win.webContents.send('display', latest || store.display());
    });
    win.loadFile(path.join(__dirname, 'index.html'));
    win.once('ready-to-show', () => win.showInactive());

    watchForeground();

    tray = new Tray(trayIcon());
    tray.setToolTip('Coding companion');
    tray.setContextMenu(buildMenu());

    try {
      await startServer({ store, onDisplay: send, port: PORT });
    } catch (e) {
      send({ team: 'default', mood: 'idle', line: e.code === 'EADDRINUSE' ? `port ${PORT} busy` : 'server error', dim: true, alert: false });
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => watcher && watcher.kill());
}
