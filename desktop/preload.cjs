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
  getWebLink: () => ipcRenderer.invoke('stelex:web-link'),
  importWebLink: () => ipcRenderer.invoke('stelex:web-import'),
  disconnectWebLink: () => ipcRenderer.invoke('stelex:web-disconnect'),
  beginVoiceCapture: () => ipcRenderer.invoke('stelex:begin-voice'),
  endVoiceCapture: () => ipcRenderer.invoke('stelex:end-voice'),
  transcribeAudio: (value) => ipcRenderer.invoke('stelex:transcribe', value),
  cancelTranscription: (requestId) => ipcRenderer.invoke('stelex:cancel-voice', requestId),
  getOutputDirectory: () => ipcRenderer.invoke('stelex:output-directory'),
  chooseOutputDirectory: () => ipcRenderer.invoke('stelex:choose-output-directory'),
  generateFiles: (value) => ipcRenderer.invoke('stelex:generate-files', value),
  getGenerationStatus: (requestId) => ipcRenderer.invoke('stelex:generation-status', requestId),
  saveArtifact: (artifact) => ipcRenderer.invoke('stelex:save-artifact', artifact),
}));
