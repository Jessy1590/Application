const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setWindowMode: (mode) => ipcRenderer.invoke('window:setMode', mode),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore),
  openModule: (view, data) => ipcRenderer.invoke('window:openModule', view, data),
  openDashboard: (options) => ipcRenderer.invoke('window:openDashboard', options || null),
  onDashboardNavigate: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('dashboard:navigate', handler);
    return () => ipcRenderer.removeListener('dashboard:navigate', handler);
  },
  openBug: () => ipcRenderer.invoke('window:openBug'),
  submitBugReport: (text) => ipcRenderer.invoke('bug:submit', text),
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
