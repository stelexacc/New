'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stelex', Object.freeze({
  getConnection: () => ipcRenderer.invoke('stelex:connection'),
  setServerUrl: (url) => ipcRenderer.invoke('stelex:set-server', url),
  getPreferences: () => ipcRenderer.invoke('stelex:preferences'),
  setPreferences: (preferences) => ipcRenderer.invoke('stelex:set-preferences', preferences),
  openExternal: (url) => ipcRenderer.invoke('stelex:external', url),
}));
