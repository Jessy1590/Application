/**
 * Pont IPC Electron — seul fichier autorisé à appeler window.electronAPI.
 */
import { logEvent } from './logService.js';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

export async function setWindowMode(mode) {
  if (!isElectron) {
    console.warn('[PharmaOS] electronAPI indisponible (mode navigateur ?)');
    return null;
  }
  const result = await window.electronAPI.setWindowMode(mode);
  logEvent({
    category: 'window',
    action: 'set_mode',
    entity: mode,
    message: `Fenêtre → ${mode}`,
    details: result,
  });
  return result;
}

export function loginWindow() {
  return setWindowMode('login');
}

export function expandWindow() {
  return setWindowMode('expanded');
}

export function reduceWindow() {
  return setWindowMode('reduced');
}

export async function openModuleWindow(viewName, data = null) {
  if (window.electronAPI?.openModule) {
    const result = await window.electronAPI.openModule(viewName, data);
    logEvent({
      category: 'window',
      action: 'open_module',
      entity: viewName,
      message: `Module ${viewName}`,
      details: { status: result?.status, hasData: !!data },
    });
    return result;
  }
  console.warn('[PharmaOS] electronAPI.openModule indisponible');
  return null;
}

export async function openDashboardWindow(options = null) {
  if (window.electronAPI?.openDashboard) {
    const result = await window.electronAPI.openDashboard(options || null);
    logEvent({
      category: 'window',
      action: 'open_dashboard',
      message: 'Ouverture dashboard',
      details: options,
    });
    return result;
  }
  console.warn('[PharmaOS] electronAPI.openDashboard indisponible');
  return null;
}

export async function openBugWindow() {
  if (window.electronAPI?.openBug) {
    const result = await window.electronAPI.openBug();
    logEvent({ category: 'window', action: 'open_bug', message: 'Fenêtre bug' });
    return result;
  }
  console.warn('[PharmaOS] electronAPI.openBug indisponible');
  return null;
}

export async function closeModuleWindow() {
  if (window.electronAPI?.closeModule) {
    return window.electronAPI.closeModule();
  }
  console.warn('[PharmaOS] electronAPI.closeModule indisponible');
  return null;
}

/** Confirme la fermeture après sauvegarde auto (réponse à module:before-close). */
export async function confirmModuleClose() {
  if (window.electronAPI?.confirmModuleClose) {
    return window.electronAPI.confirmModuleClose();
  }
  return closeModuleWindow();
}

/** Handler optionnel enregistré par la vue courante (ex. IP auto-attente). */
let moduleBeforeCloseHandler = null;

export function setModuleBeforeCloseHandler(fn) {
  moduleBeforeCloseHandler = typeof fn === 'function' ? fn : null;
}

/** Branche le pont Electron → handler de vue (à appeler une fois dans module-main). */
export function bindModuleBeforeCloseBridge() {
  if (!window.electronAPI?.onModuleBeforeClose) return () => {};
  return window.electronAPI.onModuleBeforeClose(async () => {
    try {
      if (moduleBeforeCloseHandler) await moduleBeforeCloseHandler();
    } catch (err) {
      console.error('[PharmaOS] before-close handler', err);
    }
    await confirmModuleClose();
  });
}

/** @deprecated préférer setModuleBeforeCloseHandler */
export function onModuleBeforeClose(callback) {
  return window.electronAPI?.onModuleBeforeClose?.(callback) || (() => {});
}

export async function setClickThrough(ignore) {
  if (window.electronAPI?.setIgnoreMouseEvents) {
    return window.electronAPI.setIgnoreMouseEvents(!!ignore);
  }
  return null;
}

/** Démarre le bus contexte texte (UIA Bloc-notes + presse-papiers). */
export async function startContextWatch() {
  if (window.electronAPI?.startContextWatch) {
    return window.electronAPI.startContextWatch();
  }
  return { ok: false, error: 'unavailable' };
}

export async function stopContextWatch() {
  if (window.electronAPI?.stopContextWatch) {
    return window.electronAPI.stopContextWatch();
  }
  return { ok: false, error: 'unavailable' };
}

/** @param {(payload: object) => void} callback @returns {() => void} */
export function onContextText(callback) {
  if (!window.electronAPI?.onContextText) return () => {};
  return window.electronAPI.onContextText(callback);
}

/** @param {(view: string, data: object|null) => void} callback */
export function onModuleChangeView(callback) {
  if (!window.electronAPI?.onModuleChangeView) return () => {};
  return window.electronAPI.onModuleChangeView(callback);
}

/** @param {(payload: object) => void} callback @returns {() => void} */
export function onDashboardNavigate(callback) {
  if (!window.electronAPI?.onDashboardNavigate) return () => {};
  return window.electronAPI.onDashboardNavigate(callback);
}

/**
 * Ouvre une URL externe (Portail Application, docs…).
 * @param {string} url
 */
export async function openExternal(url) {
  if (window.electronAPI?.openExternal) {
    return window.electronAPI.openExternal(url);
  }
  if (typeof window !== 'undefined' && window.open) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, via: 'window.open' };
  }
  console.warn('[PharmaOS] openExternal indisponible');
  return { ok: false, error: 'unavailable' };
}

/**
 * Applique placement / densité / thème de la taskbar côté main process.
 * @param {{ placement?: string, density?: string, theme?: string }} layout
 */
export async function setTaskbarLayout(layout) {
  if (window.electronAPI?.setTaskbarLayout) {
    return window.electronAPI.setTaskbarLayout(layout || {});
  }
  return { ok: false, error: 'unavailable' };
}

/**
 * Écoute les préférences diffusées par le main (toutes les fenêtres).
 * @param {(payload: { placement?: string, density?: string, theme?: string }) => void} callback
 * @returns {() => void}
 */
export function onPrefsChanged(callback) {
  if (!window.electronAPI?.onPrefsChanged) return () => {};
  return window.electronAPI.onPrefsChanged(callback);
}
