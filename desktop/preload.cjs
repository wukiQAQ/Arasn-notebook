const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  info: () => ipcRenderer.invoke("app:info"),
  layout: (value) => ipcRenderer.invoke("app:layout", value),
  onLayout: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("app:layout", listener);
    return () => ipcRenderer.removeListener("app:layout", listener);
  },
  onFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:focus", listener);
    return () => ipcRenderer.removeListener("app:focus", listener);
  },
  share: (enabled) => ipcRenderer.invoke("app:share", enabled),
  hide: () => ipcRenderer.invoke("app:hide"),
  shortcut: (value) => ipcRenderer.invoke("app:shortcut", value),
  settings: (value) => ipcRenderer.invoke("app:settings", value),
  recovery: () => ipcRenderer.invoke("app:recovery"),
  saveRecovery: (value) => ipcRenderer.invoke("app:saveRecovery", value),
});
