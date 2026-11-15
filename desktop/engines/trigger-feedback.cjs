const path = require("node:path");

function feedbackBounds(screen, hit) {
  const pointer = screen.screenToDipPoint(hit.point);
  const area = screen.getDisplayNearestPoint(pointer).workArea;
  const region = hit.binding.input.region;
  const vertical = region === "left" || region === "right";
  const length = Math.min(64, vertical ? area.height : area.width);
  const thickness = 4;
  const place = (value, start, span) => Math.round(Math.max(start, Math.min(start + span - length, value - length / 2)));
  if (vertical) return { x: region === "left" ? area.x : area.x + area.width - thickness,
    y: place(pointer.y, area.y, area.height), width: thickness, height: length };
  const x = region.includes("left") ? area.x : region.includes("right") ? area.x + area.width - length :
    place(pointer.x, area.x, area.width);
  return { x, y: region.startsWith("top") ? area.y : area.y + area.height - thickness, width: length, height: thickness };
}

function triggerFeedback(BrowserWindow, screen) {
  let window, ready, current, color = "#4358c4";
  let fading;
  function render() {
    if (!ready || !current || !window || window.isDestroyed()) return;
    const region = current.binding.input.region;
    const target = feedbackBounds(screen, current);
    window.setBounds(target);
    const actual = window.getBounds();
    // Windows can enforce a larger minimum frame even for transparent windows.
    if (region === "right" && actual.width !== target.width)
      window.setPosition(target.x + target.width - actual.width, target.y);
    else if (region.startsWith("bottom") && actual.height !== target.height)
      window.setPosition(target.x, target.y + target.height - actual.height);
    window.webContents.send("edge:feedback", {
      duration: current.duration, color, region,
    });
    if (!window.isVisible()) window.showInactive();
  }
  return {
    palette(value) {
      if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) color = value;
    },
    set(hit) {
      clearTimeout(fading);
      current = hit;
      if (!hit) {
        if (window?.isVisible()) {
          window.webContents.send("edge:fade");
          fading = setTimeout(() => window?.hide(), 100);
        }
        return;
      }
      if (window) { render(); return; }
      const created = new BrowserWindow({
        ...feedbackBounds(screen, hit), show: false, frame: false, transparent: true,
        title: "Arasn Edge Feedback", skipTaskbar: true, focusable: false,
        alwaysOnTop: true, resizable: false, movable: false, hasShadow: false, thickFrame: false,
        webPreferences: { preload: path.join(__dirname, "../edge-feedback-preload.cjs"),
          nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      window = created;
      created.setIgnoreMouseEvents(true);
      created.on("closed", () => {
        if (window === created) { window = undefined; ready = false; }
      });
      void created.loadFile(path.join(__dirname, "../edge-feedback.html")).then(() => {
        if (window !== created) return;
        ready = true;
        render();
      }).catch(() => {
        if (!created.isDestroyed()) created.destroy();
      });
    },
    dispose() {
      clearTimeout(fading);
      current = undefined;
      window?.destroy();
    },
  };
}

module.exports = { feedbackBounds, triggerFeedback };
