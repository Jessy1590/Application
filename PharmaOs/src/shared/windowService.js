/**
 * Pont IPC Electron — seul fichier autorisé à appeler window.electronAPI.
 */

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

export async function setWindowMode(mode) {
  if (!isElectron) {
    console.warn('[PharmaOS] electronAPI indisponible (mode navigateur ?)');
    return null;
  }
  return window.electronAPI.setWindowMode(mode);
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
    return window.electronAPI.openModule(viewName, data);
  }
  console.warn('[PharmaOS] electronAPI.openModule indisponible');
  return null;
}

export async function openDashboardWindow() {
  if (window.electronAPI?.openDashboard) {
    return window.electronAPI.openDashboard();
  }
  console.warn('[PharmaOS] electronAPI.openDashboard indisponible');
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
