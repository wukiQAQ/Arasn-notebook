import { finishGesture, gestureCandidates } from "../../desktop/engines/gesture-path.mjs";
import { gestureButtons, modifiersFor, type Binding, type GestureInput, type TriggerConfig } from "./TriggerSettings";

export function watchLocalGestures(config: TriggerConfig) {
  if (config.paused) return;
  const rows = config.bindings.filter((row): row is Binding & { input: GestureInput } =>
    row.enabled && row.input.device === "gesture" && !row.input.global);
  if (!rows.length) return;
  const listeners = new AbortController();
  let hold: { id: number; button: number; paths: ReturnType<typeof gestureCandidates<typeof rows[number]>> } | undefined;
  let deadline: number | undefined;
  const reset = () => { window.clearTimeout(deadline); hold = undefined; };
  const point = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  document.addEventListener("pointerdown", event => {
    if (hold || event.pointerType !== "mouse" || !(event.target instanceof Element) ||
        !event.target.closest(".quick-header, .xigra-workbench-bar") ||
        event.target.closest("button, a, input, select, textarea, [contenteditable]")) return;
    const button = gestureButtons[event.button];
    if (!button) return;
    const paths = gestureCandidates(rows, button, modifiersFor(event), point(event), performance.now());
    if (!paths.length) return;
    hold = { id: event.pointerId, button: event.button, paths };
    deadline = window.setTimeout(reset, Math.max(...paths.map(({ binding }) => binding.input.timeoutMs)) + 1);
  }, { signal: listeners.signal, passive: true });
  document.addEventListener("pointermove", event => {
    if (!hold || event.pointerId !== hold.id) return;
    const now = performance.now(), position = point(event);
    for (const { path } of hold.paths) path.move(position, now);
  }, { signal: listeners.signal, passive: true });
  document.addEventListener("pointerup", event => {
    if (!hold || event.pointerId !== hold.id || event.button !== hold.button) return;
    const match = finishGesture(hold.paths, point(event), performance.now());
    reset();
    if (match) void window.desktop?.triggers.local(match.id).catch(() => {});
  }, { signal: listeners.signal, passive: true });
  document.addEventListener("pointercancel", reset, { signal: listeners.signal });
  window.addEventListener("blur", reset, { signal: listeners.signal });
  return () => { reset(); listeners.abort(); };
}
