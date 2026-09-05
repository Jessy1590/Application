const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setWindowMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore),
  openModule: (view, data) => ipcRenderer.invoke('window:openModule', view, data),
  openDashboard: () => ipcRenderer.invoke('window:openDashboard'),
  onModuleChangeView: (callback) => {
    ipcRenderer.on('module:change-view', (_event, view, data) => callback(view, data));
  },
  closeModule: () => ipcRenderer.invoke('window:closeModule'),
  confirmModuleClose: () => ipcRenderer.invoke('window:confirmModuleClose'),
  onModuleBeforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('module:before-close', handler);
    return () => ipcRenderer.removeListener('module:before-close', handler);
  },
});
