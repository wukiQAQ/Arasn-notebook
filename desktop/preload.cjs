const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  info: () => ipcRenderer.invoke("app:info"),
  share: (enabled) => ipcRenderer.invoke("app:share", enabled),
  hide: () => ipcRenderer.invoke("app:hide"),
  shortcut: (value) => ipcRenderer.invoke("app:shortcut", value),
  recovery: () => ipcRenderer.invoke("app:recovery"),
  saveRecovery: (value) => ipcRenderer.invoke("app:saveRecovery", value),
});
