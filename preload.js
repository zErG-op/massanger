const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openWindow: (data) => ipcRenderer.send('open-new-window', data),
    closeWindow: () => ipcRenderer.send('close-current-window')
});