import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dimensions pilotées par IPC depuis React (voir services/windowService.js côté renderer)
const HEIGHT_EXPANDED = 60; // barre du haut, utilisateur authentifie
const HEIGHT_REDUCED = 20; // barre du haut, mode reduit
const LOGIN_WIDTH = 420; // fenetre centree, ecran de connexion
const LOGIN_HEIGHT = 480;

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
// Mode courant, utilise pour recalculer les bounds si l'ecran change
// (display-metrics-changed) sans devoir interroger le renderer.
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

  const height = mode === 'reduced' ? HEIGHT_REDUCED : HEIGHT_EXPANDED;
  return { width: screenWidth, height, x: 0, y: 0 };
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

  // Garde la fenetre au-dessus de tout, y compris le plein-ecran d'autres apps
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Recalcule les bounds si l'utilisateur change de resolution / moniteur,
  // en respectant le mode courant (centre pour 'login', pleine largeur sinon).
  screen.on('display-metrics-changed', () => {
    if (!mainWindow) return;
    mainWindow.setBounds(computeBoundsForMode(currentMode));
  });
}

/**
 * Canal IPC : 'window:setMode'
 * Payload attendu : 'login' | 'expanded' | 'reduced'
 * - 'login'    : fenetre centree (420x480), ecran de connexion (non authentifie)
 * - 'expanded' : barre pleine largeur, 60px, en haut de l'ecran (authentifie)
 * - 'reduced'  : barre pleine largeur, 20px, en haut de l'ecran (authentifie, reduit)
 * Le renderer (React) appelle window.electronAPI.setWindowMode(mode),
 * expose via preload.cjs, qui invoque ce handler.
 */
ipcMain.handle('window:setMode', (_event, mode) => {
  if (!mainWindow) return { ok: false, error: 'no-window' };
  if (!['login', 'expanded', 'reduced'].includes(mode)) {
    return { ok: false, error: 'invalid-mode' };
  }

  currentMode = mode;
  const bounds = computeBoundsForMode(mode);
  mainWindow.setBounds(bounds);

  return { ok: true, mode, ...bounds };
});
let moduleWindow = null;

/**
 * Canal IPC : 'window:openModule'
 * Ouvre ou met au premier plan la fenêtre secondaire générique.
 */
ipcMain.handle('window:openModule', (_event, view, data) => {
  // Si la fenêtre existe déjà, on la ramène au premier plan et on change sa vue
  if (moduleWindow) {
    if (moduleWindow.isMinimized()) moduleWindow.restore();
    moduleWindow.focus();
    moduleWindow.webContents.send('module:change-view', view, data);
    return { ok: true, status: 'focused' };
  }

  // Sinon on la crée (900x600, centrée)
  moduleWindow = new BrowserWindow({
    width: 900,
    height: 600,
    center: true,
    show: false, // On cache le temps du chargement
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // On utilise le "hash" de l'URL pour indiquer au React quelle vue charger (#directory, #ip...)
  const viewHash = `#${view}`;

  if (isDev) {
    moduleWindow.loadURL(`http://localhost:5173/module.html${viewHash}`);
    // moduleWindow.webContents.openDevTools({ mode: 'detach' }); // Au besoin
  } else {
    moduleWindow.loadFile(path.join(__dirname, '../dist/module.html'), { hash: view });
  }

  moduleWindow.once('ready-to-show', () => {
    moduleWindow.show();
  });

  moduleWindow.on('closed', () => {
    moduleWindow = null;
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
