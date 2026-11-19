const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  onDisplay: (cb) => ipcRenderer.on('display', (_e, d) => cb(d)),
  onMute: (cb) => ipcRenderer.on('mute', (_e, m) => cb(m)),
  onPark: (cb) => ipcRenderer.on('park', () => cb()),
  setInteractive: (on) => ipcRenderer.send('interactive', !!on),
  quit: () => ipcRenderer.send('quit'),
  sweep: () => ipcRenderer.send('sweep'),
  onFxHide: (cb) => ipcRenderer.on('fx-hide', () => cb()),
  onFx: (cb) => ipcRenderer.on('fx', (_e, d) => cb(d)),
});
