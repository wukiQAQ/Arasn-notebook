const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  initialTheme: ipcRenderer.sendSync("app:theme"),
  canvas: {
    create: (options) => ipcRenderer.invoke("canvas:create", options),
    migrate: (options) => ipcRenderer.invoke("canvas:migrate", options),
  },
  lan: {
    view: () => ipcRenderer.invoke("lan:view"),
    start: (host) => ipcRenderer.invoke("lan:start", host),
    stop: () => ipcRenderer.invoke("lan:stop"),
    invite: () => ipcRenderer.invoke("lan:invite"),
    pair: (code, fingerprint) => ipcRenderer.invoke("lan:pair", code, fingerprint),
    revoke: (fingerprint) => ipcRenderer.invoke("lan:revoke", fingerprint),
    send: (id, fingerprint) => ipcRenderer.invoke("lan:send", id, fingerprint),
    respond: (id, accept) => ipcRenderer.invoke("lan:respond", id, accept),
    retry: (id) => ipcRenderer.invoke("lan:retry", id),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("lan:changed", listener);
      return () => ipcRenderer.removeListener("lan:changed", listener);
    },
    onOpen: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("lan:open", listener);
      return () => ipcRenderer.removeListener("lan:open", listener);
    },
  },
  files: {
    originalImage: id => ipcRenderer.invoke("files:originalImage", id),
    thumbnail: (id) => ipcRenderer.invoke("files:thumbnail", id),
    list: (options) => ipcRenderer.invoke("files:list", options),
    choose: () => ipcRenderer.invoke("files:choose"),
    drop: (files) =>
      ipcRenderer.invoke(
        "files:drop",
        Array.from(files).map((file) => webUtils.getPathForFile(file)),
      ),
    action: (action, args) => ipcRenderer.invoke("files:action", action, args),
    paste: () => ipcRenderer.invoke("clipboard:paste"),
    clearPanel: () => ipcRenderer.invoke("panel:clear"),
    progress: (callback) => {
      const listener = (_e, value) => callback(value);
      ipcRenderer.on("files:progress", listener);
      return () => ipcRenderer.removeListener("files:progress", listener);
    },
  },
  onBoard: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("board:changed", listener);
    return () => ipcRenderer.removeListener("board:changed", listener);
  },
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
  share: (enabled, host) => ipcRenderer.invoke("app:share", enabled, host),
  hide: () => ipcRenderer.invoke("app:hide"),
  onWindowIntent: (callback) => {
    const listener = async (_event, id, action) => {
      const allowed = await callback(action).catch(() => false);
      await ipcRenderer.invoke("app:confirmWindowIntent", id, allowed).catch(() => {});
    };
    ipcRenderer.on("app:windowIntent", listener);
    return () => ipcRenderer.removeListener("app:windowIntent", listener);
  },
  shortcut: (value) => ipcRenderer.invoke("app:shortcut", value),
  triggers: {
    capture: (active) => ipcRenderer.invoke("app:trigger-capture", active),
    probe: (config) => ipcRenderer.invoke("app:trigger-probe", config),
    defaults: () => ipcRenderer.invoke("app:trigger-defaults"),
    test: (active) => ipcRenderer.invoke("app:trigger-test", active),
    local: (id) => ipcRenderer.invoke("app:trigger-local", id),
    palette: (color) => ipcRenderer.invoke("app:trigger-palette", color),
    onArrival: (callback) => {
      const listener = (_event, region) => callback(region);
      ipcRenderer.on("app:trigger-arrival", listener);
      return () => ipcRenderer.removeListener("app:trigger-arrival", listener);
    },
    onDetected: (callback) => {
      const listener = (_event, binding) => callback(binding);
      ipcRenderer.on("app:trigger-detected", listener);
      return () => ipcRenderer.removeListener("app:trigger-detected", listener);
    },
    onCaptured: (callback) => {
      const listener = (_event, input) => callback(input);
      ipcRenderer.on("app:trigger-captured", listener);
      return () => ipcRenderer.removeListener("app:trigger-captured", listener);
    },
    onCaptureEnded: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("app:trigger-capture-ended", listener);
      return () => ipcRenderer.removeListener("app:trigger-capture-ended", listener);
    },
    onAction: (callback) => {
      const listener = (_event, action) => callback(action);
      ipcRenderer.on("app:trigger-action", listener);
      return () => ipcRenderer.removeListener("app:trigger-action", listener);
    },
  },
  copyText: (text) => ipcRenderer.invoke("clipboard:copyText", text),
  settings: (value) => ipcRenderer.invoke("app:settings", value),
  recovery: () => ipcRenderer.invoke("app:recovery"),
  saveRecovery: (value) => ipcRenderer.invoke("app:saveRecovery", value),
});
