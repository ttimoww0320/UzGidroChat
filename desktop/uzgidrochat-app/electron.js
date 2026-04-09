const { app, BrowserWindow, session } = require('electron');
const path = require('path');

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

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
