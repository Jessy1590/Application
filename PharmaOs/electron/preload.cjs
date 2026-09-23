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
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  setTaskbarLayout: (layout) => ipcRenderer.invoke('window:setTaskbarLayout', layout || {}),
  onPrefsChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('prefs:changed', handler);
    return () => ipcRenderer.removeListener('prefs:changed', handler);
  },
  onModuleChangeView: (callback) => {
    const handler = (_event, view, data) => callback(view, data);
    ipcRenderer.on('module:change-view', handler);
    return () => ipcRenderer.removeListener('module:change-view', handler);
  },
  closeModule: () => ipcRenderer.invoke('window:closeModule'),
  confirmModuleClose: () => ipcRenderer.invoke('window:confirmModuleClose'),
  onModuleBeforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('module:before-close', handler);
    return () => ipcRenderer.removeListener('module:before-close', handler);
  },
  startContextWatch: () => ipcRenderer.invoke('context:startWatch'),
  stopContextWatch: () => ipcRenderer.invoke('context:stopWatch'),
  onContextText: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('context:text', handler);
    return () => ipcRenderer.removeListener('context:text', handler);
  },
});
