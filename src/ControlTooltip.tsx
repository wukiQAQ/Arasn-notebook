import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

export function ControlTooltip({ children, label, enabled = true, side = "right", toolbar = false }: { children: ReactElement; label: ReactNode; enabled?: boolean; side?: "right" | "bottom"; toolbar?: boolean }) {
  return <Tooltip.Root disabled={!enabled}>
    <Tooltip.Trigger render={children} delay={500} />
    <Tooltip.Portal><Tooltip.Positioner className={toolbar ? "adaptive-tooltip-position window-tooltip-position" : "adaptive-tooltip-position"} side={side} sideOffset={toolbar ? 16 : 8}
      collisionPadding={toolbar ? { top: 52, right: 12, bottom: 12, left: 12 } : 8}>
      <Tooltip.Popup role="tooltip" className="adaptive-tooltip">{label}</Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
