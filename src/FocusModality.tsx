import { useEffect } from "react";

/** Text fields match :focus-visible even after a click in Chromium. */
export function FocusModality() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-focus-modality");
    root.dataset.focusModality = "pointer";
    const pointer = () => { root.dataset.focusModality = "pointer"; };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.ctrlKey || event.metaKey || event.altKey)
        root.dataset.focusModality = "keyboard";
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      if (previous === null) root.removeAttribute("data-focus-modality");
      else root.setAttribute("data-focus-modality", previous);
    };
  }, []);
  return null;
}
