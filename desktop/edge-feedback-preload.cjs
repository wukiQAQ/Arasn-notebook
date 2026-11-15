const { ipcRenderer } = require("electron");

ipcRenderer.on("edge:feedback", (_event, { duration, color, region }) => {
  const root = document.documentElement;
  root.style.setProperty("--edge-color", color);
  root.style.setProperty("--edge-duration", `${duration}ms`);
  root.dataset.region = region;
  root.toggleAttribute("data-vertical", region === "left" || region === "right");
  root.removeAttribute("data-fading");
  root.removeAttribute("data-running");
  // Restart the animation when the same hidden indicator is reused.
  void root.offsetWidth;
  root.setAttribute("data-running", "");
});
ipcRenderer.on("edge:fade", () => document.documentElement.setAttribute("data-fading", ""));
