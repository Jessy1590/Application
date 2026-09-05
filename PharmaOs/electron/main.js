import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEIGHT_EXPANDED = 60;
const HEIGHT_REDUCED = 28;
const WIDTH_REDUCED = 56;
const LOGIN_WIDTH = 420;
const LOGIN_HEIGHT = 480;

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let moduleWindow = null;
let dashboardWindow = null;
let currentMode = 'login';

function computeBoundsForMode(mode) {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  if (mode === 'login') {
    return {
      width: LOGIN_WIDTH,
      height: LOGIN_HEIGHT,
      x: Math.round((screenWidth - LOGIN_WIDTH) / 2),
      y: Math.round((screenHeight - LOGIN_HEIGHT) / 2),
    };
  }

  if (mode === 'reduced') {
    return {
      width: WIDTH_REDUCED,
      height: HEIGHT_REDUCED,
      x: Math.round((screenWidth - WIDTH_REDUCED) / 2),
      y: 0,
    };
  }

  return { width: screenWidth, height: HEIGHT_EXPANDED, x: 0, y: 0 };
}

function createWindow() {
  const initialBounds = computeBoundsForMode(currentMode);

  mainWindow = new BrowserWindow({
    ...initialBounds,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  screen.on('display-metrics-changed', () => {
    if (!mainWindow) return;
    mainWindow.setBounds(computeBoundsForMode(currentMode));
  });
}

ipcMain.handle('window:setMode', (_event, mode) => {
  if (!mainWindow) return { ok: false, error: 'no-window' };
  if (!['login', 'expanded', 'reduced'].includes(mode)) {
    return { ok: false, error: 'invalid-mode' };
  }

  currentMode = mode;
  const bounds = computeBoundsForMode(mode);
  mainWindow.setBounds(bounds);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.show();

  return { ok: true, mode, ...bounds };
});

ipcMain.handle('window:setIgnoreMouseEvents', (_event, ignore) => {
  if (!mainWindow) return { ok: false };
  if (ignore && currentMode === 'reduced') {
    mainWindow.setIgnoreMouseEvents(false);
    return { ok: true, ignore: false, reason: 'reduced-bounds' };
  }
  if (ignore) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
  return { ok: true, ignore: !!ignore };
});

ipcMain.handle('window:openModule', (_event, view, data) => {
  if (moduleWindow) {
    if (moduleWindow.isMinimized()) moduleWindow.restore();
    moduleWindow.focus();
    moduleWindow.webContents.send('module:change-view', view, data);
    return { ok: true, status: 'focused' };
  }

  let moduleForceClose = false;

  moduleWindow = new BrowserWindow({
    width: 900,
    height: 600,
    center: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    moduleWindow.loadURL(`http://localhost:5173/module.html#${view}`);
  } else {
    moduleWindow.loadFile(path.join(__dirname, '../dist/module.html'), { hash: view });
  }

  moduleWindow.once('ready-to-show', () => {
    moduleWindow.show();
  });

  moduleWindow.on('close', (e) => {
    if (moduleForceClose) return;
    e.preventDefault();
    moduleWindow.webContents.send('module:before-close');
  });

  moduleWindow.on('closed', () => {
    moduleWindow = null;
  });

  // Stocker le flag sur la fenêtre pour les handlers IPC
  moduleWindow._forceClose = () => { moduleForceClose = true; };

  return { ok: true, status: 'created' };
});

ipcMain.handle('window:closeModule', () => {
  if (moduleWindow) {
    if (typeof moduleWindow._forceClose === 'function') moduleWindow._forceClose();
    moduleWindow.close();
    return { ok: true };
  }
  return { ok: false, error: 'no-module-window' };
});

ipcMain.handle('window:confirmModuleClose', () => {
  if (moduleWindow) {
    if (typeof moduleWindow._forceClose === 'function') moduleWindow._forceClose();
    moduleWindow.close();
    return { ok: true };
  }
  return { ok: false, error: 'no-module-window' };
});

ipcMain.handle('window:openDashboard', () => {
  if (dashboardWindow) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.focus();
    return { ok: true, status: 'focused' };
  }

  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    center: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    dashboardWindow.loadURL('http://localhost:5173/dashboard.html');
  } else {
    dashboardWindow.loadFile(path.join(__dirname, '../dist/dashboard.html'));
  }

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return { ok: true, status: 'created' };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
