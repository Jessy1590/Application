/**
 * Encapsule les appels IPC exposés par electron/preload.cjs.
 * Toute la logique de "reduction" de la fenetre passe par ici,
 * pour ne jamais toucher a window.electronAPI ailleurs dans l'app.
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

// app/src/services/windowService.js
// (Garde le code existant pour setWindowMode, loginWindow, expandWindow, etc.)

export const openModuleWindow = async (viewName, data = null) => {
  if (window.electronAPI && window.electronAPI.openModule) {
    return await window.electronAPI.openModule(viewName, data);
  }
  console.warn("electronAPI non disponible (environnement web pur)");
};

