import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createContextTextBus } from './contextText/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEIGHT_REDUCED = 28;
const WIDTH_REDUCED = 56;
const LOGIN_WIDTH = 420;
const LOGIN_HEIGHT = 480;

const PLACEMENTS = new Set(['haut', 'bas', 'gauche', 'droite', 'bas_gauche', 'bas_droite']);
const DENSITIES = new Set(['compact', 'normal', 'detaillee', 'empilee']);
const THEMES = new Set(['clair', 'sombre', 'colore', 'bleu_dore']);

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let moduleWindow = null;
let dashboardWindow = null;
let bugWindow = null;
let currentMode = 'login';
let pendingDashboardNav = null;
let taskbarLayout = {
  placement: 'haut',
  density: 'normal',
  theme: 'clair',
  font_size_taskbar: 'md',
  font_size_dashboard: 'md',
};

/** Legacy densités (si un renderer envoie encore auto/stack). */
function normalizeDensity(density) {
  if (density === 'auto') return 'normal';
  if (density === 'stack') return 'empilee';
  return density;
}

/** Legacy thèmes (contraste / daltonien → migration 047). */
function normalizeTheme(theme) {
  if (theme === 'contraste') return 'clair';
  if (theme === 'daltonien') return 'bleu_dore';
  return theme;
}

/** Hauteur bande horizontale (haut / bas). */
function horizontalThickness(density) {
  switch (normalizeDensity(density)) {
    case 'compact':
      return 44;
    case 'detaillee':
      return 70;
    case 'empilee':
      return 84;
    case 'normal':
    default:
      return 52;
  }
}

/**
 * Largeur bande verticale (gauche / droite).
 * empilee : plus étroite (labels au-dessus, logos dessous).
 */
function verticalThickness(density) {
  switch (normalizeDensity(density)) {
    case 'compact':
      return 56;
    case 'detaillee':
      return 96;
    case 'empilee':
      return 72;
    case 'normal':
    default:
      return 80;
  }
}

/**
 * Rectangle coin : 1 ligne ≈ 1 sous-groupe.
 * ~9 sections max + barre d'actions.
 */
function cornerSize(density, screenWidth, screenHeight) {
  const d = normalizeDensity(density);
  const rowH = d === 'empilee' ? 56 : d === 'detaillee' ? 50 : d === 'compact' ? 34 : 38;
  const maxSections = 9;
  const actionsH = d === 'empilee' || d === 'detaillee' ? 56 : 44;
  const collapseStripW = 20; /* même bande latérale que gauche/droite */
  const height = Math.min(
    Math.round(screenHeight * 0.58),
    rowH * maxSections + actionsH + 12,
  );
  const minW = d === 'empilee' ? 280 : d === 'detaillee' ? 340 : 300;
  const width = Math.min(
    d === 'empilee' ? 420 : 520,
    Math.max(minW, Math.round(screenWidth * (d === 'empilee' ? 0.24 : 0.3))),
  ) + collapseStripW;
  return { width, height };
}

function broadcastPrefs(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('prefs:changed', payload);
    }
  }
}

function computeBoundsForMode(mode) {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const { placement, density } = taskbarLayout;
  const hThick = horizontalThickness(density);
  const vThick = verticalThickness(density);

  if (mode === 'login') {
    return {
      width: LOGIN_WIDTH,
      height: LOGIN_HEIGHT,
      x: Math.round((screenWidth - LOGIN_WIDTH) / 2),
      y: Math.round((screenHeight - LOGIN_HEIGHT) / 2),
    };
  }

  if (mode === 'reduced') {
    const w = WIDTH_REDUCED;
    const h = HEIGHT_REDUCED;
    /* Pastille latérale : fine, collée au bord écran (pas centrée dans le vide). */
    const edgeW = 22;
    const edgeH = 56;
    switch (placement) {
      case 'bas':
        return { width: w, height: h, x: Math.round((screenWidth - w) / 2), y: screenHeight - h };
      case 'gauche':
        return { width: edgeW, height: edgeH, x: 0, y: Math.round((screenHeight - edgeH) / 2) };
      case 'droite':
        return {
          width: edgeW,
          height: edgeH,
          x: screenWidth - edgeW,
          y: Math.round((screenHeight - edgeH) / 2),
        };
      case 'bas_gauche':
        /* Pastille collée au coin — même format latéral (flèche ←/→). */
        return { width: edgeW, height: edgeH, x: 0, y: screenHeight - edgeH };
      case 'bas_droite':
        return { width: edgeW, height: edgeH, x: screenWidth - edgeW, y: screenHeight - edgeH };
      case 'haut':
      default:
        return { width: w, height: h, x: Math.round((screenWidth - w) / 2), y: 0 };
    }
  }

  /* expanded */
  switch (placement) {
    case 'bas':
      return { width: screenWidth, height: hThick, x: 0, y: screenHeight - hThick };
    case 'gauche':
      return { width: vThick, height: screenHeight, x: 0, y: 0 };
    case 'droite':
      return { width: vThick, height: screenHeight, x: screenWidth - vThick, y: 0 };
    case 'bas_gauche': {
      const c = cornerSize(density, screenWidth, screenHeight);
      return { width: c.width, height: c.height, x: 0, y: screenHeight - c.height };
    }
    case 'bas_droite': {
      const c = cornerSize(density, screenWidth, screenHeight);
      return { width: c.width, height: c.height, x: screenWidth - c.width, y: screenHeight - c.height };
    }
    case 'haut':
    default:
      return { width: screenWidth, height: hThick, x: 0, y: 0 };
  }
}

function applyMainBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const bounds = computeBoundsForMode(currentMode);
  mainWindow.setBounds(bounds);
  return bounds;
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
    applyMainBounds();
  });
}

ipcMain.handle('window:setMode', (_event, mode) => {
  if (!mainWindow) return { ok: false, error: 'no-window' };
  if (!['login', 'expanded', 'reduced'].includes(mode)) {
    return { ok: false, error: 'invalid-mode' };
  }

  currentMode = mode;
  const bounds = applyMainBounds();
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.show();

  return { ok: true, mode, ...bounds };
});

ipcMain.handle('window:setTaskbarLayout', (_event, layout) => {
  const next = layout && typeof layout === 'object' ? layout : {};
  if (PLACEMENTS.has(next.placement)) taskbarLayout.placement = next.placement;
  const density = normalizeDensity(next.density);
  if (DENSITIES.has(density)) taskbarLayout.density = density;
  const theme = normalizeTheme(next.theme);
  if (THEMES.has(theme)) taskbarLayout.theme = theme;
  if (['sm', 'md', 'lg'].includes(next.font_size_taskbar)) {
    taskbarLayout.font_size_taskbar = next.font_size_taskbar;
  }
  if (['sm', 'md', 'lg'].includes(next.font_size_dashboard)) {
    taskbarLayout.font_size_dashboard = next.font_size_dashboard;
  }
  const bounds = currentMode !== 'login' ? applyMainBounds() : null;
  const payload = { ...taskbarLayout };
  broadcastPrefs(payload);
  return { ok: true, ...payload, bounds };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, error: 'invalid-url' };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'invalid-url' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, error: 'protocol' };
  }
  await shell.openExternal(parsed.toString());
  return { ok: true };
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

ipcMain.handle('window:openDashboard', (_event, options) => {
  const nav = options && typeof options === 'object' ? options : null;
  if (nav) pendingDashboardNav = nav;

  const sendNav = () => {
    if (dashboardWindow && pendingDashboardNav) {
      dashboardWindow.webContents.send('dashboard:navigate', pendingDashboardNav);
      pendingDashboardNav = null;
    }
  };

  if (dashboardWindow) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.focus();
    sendNav();
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
    sendNav();
  });

  dashboardWindow.webContents.on('did-finish-load', () => {
    sendNav();
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return { ok: true, status: 'created' };
});

ipcMain.handle('window:openBug', () => {
  if (bugWindow) {
    if (bugWindow.isMinimized()) bugWindow.restore();
    bugWindow.focus();
    return { ok: true, status: 'focused' };
  }

  bugWindow = new BrowserWindow({
    width: 560,
    height: 480,
    center: true,
    show: false,
    autoHideMenuBar: true,
    title: 'PharmaOS — Signalement bug',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    bugWindow.loadURL('http://localhost:5173/bug.html');
  } else {
    bugWindow.loadFile(path.join(__dirname, '../dist/bug.html'));
  }

  bugWindow.once('ready-to-show', () => {
    bugWindow.show();
  });

  bugWindow.on('closed', () => {
    bugWindow = null;
  });

  return { ok: true, status: 'created' };
});

const contextTextBus = createContextTextBus({
  getTargetWebContents: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
});

ipcMain.handle('context:startWatch', () => contextTextBus.startWatch());
ipcMain.handle('context:stopWatch', () => contextTextBus.stopWatch());

app.on('before-quit', () => {
  contextTextBus.stopWatch();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
