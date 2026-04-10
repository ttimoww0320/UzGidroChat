const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  backendHost: 'http://localhost',

  // Авто-обновление
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateDownloading: (cb) => ipcRenderer.on('update-downloading', cb),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_event, percent) => cb(percent)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', cb),
  onUpdateError: (cb) => ipcRenderer.on('update-error', cb),
});
