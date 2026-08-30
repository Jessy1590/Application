// app/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setWindowMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
  
  // NOUVEAU : Demander l'ouverture de la fenêtre générique avec une vue cible
  openModule: (view, data) => ipcRenderer.invoke('window:openModule', view, data),
  
  // NOUVEAU : Écouter les changements de vue (si la fenêtre était déjà ouverte)
  onModuleChangeView: (callback) => {
    ipcRenderer.on('module:change-view', (_event, view, data) => callback(view, data));
  }
});