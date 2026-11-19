// Renders the card for each mood of a team to PNGs (visual check, e.g. after adding clips).
// Usage: electron scripts/snap.js [team] [outDir]
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const team = process.argv[2] || 'surfer';
const out = path.resolve(process.argv[3] || 'snaps');
const moods = [
  { mood: 'idle', line: `${team} online` },
  { mood: 'thinking', line: 'thinking…' },
  { mood: 'working', line: 'editing app.tsx' },
  { mood: 'needs-you', line: 'needs you', alert: true },
  { mood: 'done', line: 'done' },
];

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({
    width: 280, height: 400, show: false, frame: false, backgroundColor: '#3a3a40',
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true, offscreen: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'), { query: { still: '1' } });
  for (const m of moods) {
    win.webContents.send('mute', true);
    win.webContents.send('display', { team, dim: false, alert: false, ...m });
    await new Promise((r) => setTimeout(r, 700));
    fs.writeFileSync(path.join(out, `${team}-${m.mood}.png`), (await win.capturePage()).toPNG());
  }
  app.quit();
});
