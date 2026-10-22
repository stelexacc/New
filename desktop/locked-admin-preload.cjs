'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('stelexAdminUnlock',Object.freeze({unlock:code=>ipcRenderer.invoke('stelex-admin:unlock',code)}));
