const { app, BrowserWindow, session, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  // Electron загружает страницу через file://, поэтому браузер отправляет Origin: null.
  // Перехватываем заголовки и подставляем корректный Origin, чтобы CORS на бэкенде пропускал запросы.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Origin'] = 'http://localhost';
    callback({ requestHeaders: details.requestHeaders });
  });

  let iconPath;
  if (app.isPackaged) {
    iconPath = path.join(process.resourcesPath, 'app', 'src', 'assets', 'icon.png');
  } else {
    iconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'UzGidroChat'
  });

  const indexPath = path.join(__dirname, 'dist', 'uzgidrochat-app', 'browser', 'index.html');

  mainWindow.loadFile(indexPath).catch(err => {
    console.error('Ошибка загрузки:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Авто-обновление ──────────────────────────────────────────────────────────
function setupAutoUpdater() {
  // Авто-обновление работает только в собранном приложении
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');

  autoUpdater.autoDownload = false; // Сначала спросим пользователя
  autoUpdater.autoInstallOnAppQuit = true;

  // Доступно обновление — спрашиваем пользователя
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Доступно обновление',
      message: `Вышла новая версия UzGidroChat ${info.version}`,
      detail: 'Скачать и установить обновление? Приложение перезапустится автоматически.',
      buttons: ['Обновить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        // Сообщаем Angular что началась загрузка
        mainWindow?.webContents.send('update-downloading');
        autoUpdater.downloadUpdate();
      }
    });
  });

  // Нет обновлений
  autoUpdater.on('update-not-available', () => {
    // Ничего не показываем — тихая проверка
  });

  // Прогресс загрузки — передаём в Angular
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', Math.round(progress.percent));
  });

  // Обновление скачано — предлагаем перезапустить
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Обновление готово',
      message: 'Обновление загружено',
      detail: 'Перезапустить приложение для установки обновления?',
      buttons: ['Перезапустить', 'Позже'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      mainWindow?.webContents.send('update-downloaded');
      if (response === 0) {
        autoUpdater.quitAndInstall(true, true); // тихая установка без wizard'а
      }
    });
  });

  // Ошибка обновления
  autoUpdater.on('error', (err) => {
    console.error('Ошибка авто-обновления:', err);
    mainWindow?.webContents.send('update-error');
  });

  // Проверяем через 3 секунды после старта (чтобы окно успело загрузиться)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('Не удалось проверить обновления:', err);
    });
  }, 3000);
}

// ─── Безопасное хранилище токенов (safeStorage) ──────────────────────────────
function getEncPath(key) {
  return path.join(app.getPath('userData'), `${key}.enc`);
}

ipcMain.handle('secure-save', (_event, key, value) => {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    const encrypted = safeStorage.encryptString(value);
    fs.writeFileSync(getEncPath(key), encrypted);
    return true;
  } catch (err) {
    console.error('secure-save error:', err);
    return false;
  }
});

ipcMain.handle('secure-get', (_event, key) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const filePath = getEncPath(key);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath);
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
});

ipcMain.handle('secure-remove', (_event, key) => {
  const filePath = getEncPath(key);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('secure-remove error:', err);
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// IPC: ручная проверка обновлений из Angular
ipcMain.on('check-for-updates', () => {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.checkForUpdates().catch(err => {
    console.error('Ошибка проверки обновлений:', err);
  });
});
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
