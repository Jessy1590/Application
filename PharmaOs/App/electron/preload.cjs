// app/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setWindowMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore),

  openModule: (view, data) => ipcRenderer.invoke('window:openModule', view, data),

  onModuleChangeView: (callback) => {
    ipcRenderer.on('module:change-view', (_event, view, data) => callback(view, data));
  },
});
