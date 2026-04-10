const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  backendHost: 'http://localhost',

  // Безопасное хранилище (safeStorage в main process)
  secureSave: (key, value) => ipcRenderer.invoke('secure-save', key, value),
  secureGet: (key) => ipcRenderer.invoke('secure-get', key),
  secureRemove: (key) => ipcRenderer.invoke('secure-remove', key),

  // Авто-обновление
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateDownloading: (cb) => ipcRenderer.on('update-downloading', cb),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_event, percent) => cb(percent)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', cb),
  onUpdateError: (cb) => ipcRenderer.on('update-error', cb),
});
