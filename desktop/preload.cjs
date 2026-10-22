'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stelex', Object.freeze({
  getConnection: () => ipcRenderer.invoke('stelex:connection'),
  setServerUrl: (url) => ipcRenderer.invoke('stelex:set-server', url),
  getPreferences: () => ipcRenderer.invoke('stelex:preferences'),
  setPreferences: (preferences) => ipcRenderer.invoke('stelex:set-preferences', preferences),
  openExternal: (url) => ipcRenderer.invoke('stelex:external', url),
}));

contextBridge.exposeInMainWorld('stelexDesktop', Object.freeze({
  getOutputDirectory: () => ipcRenderer.invoke('stelex:output-directory'),
  chooseOutputDirectory: () => ipcRenderer.invoke('stelex:choose-output-directory'),
  saveArtifact: (artifact) => ipcRenderer.invoke('stelex:save-artifact', artifact),
}));
