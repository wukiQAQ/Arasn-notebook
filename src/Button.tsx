import type { ComponentPropsWithRef } from "react";
import { ControlTooltip } from "./ControlTooltip";

type Props = ComponentPropsWithRef<"button"> & { variant?: "primary" | "secondary" | "danger"; iconOnly?: boolean; tooltip?: string };
export function Button({ className = "", type = "button", variant, iconOnly, tooltip, ...props }: Props) {
  const role = variant ?? (/\b(primary|new-note|file-primary|topology-primary|xigra-quick-create)\b/.test(className) ? "primary" : /\b(file-danger|xigra-delete-button)\b/.test(className) ? "danger" : "secondary");
  const icon = iconOnly ?? className.split(" ").includes("icon-button");
  const label = tooltip ?? props.title ?? (icon ? props["aria-label"] : undefined);
  const button = <button {...props} type={type} data-ui-button={role} className={`arasn-button arasn-button-${role}${icon ? " arasn-icon-button" : ""} ${className}`} />;
  return label ? <ControlTooltip label={label}>{button}</ControlTooltip> : button;
}
