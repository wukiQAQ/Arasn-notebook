import { ControlTooltip } from "./ControlTooltip";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type NavItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  collapsed?: boolean;
  selected?: boolean;
  children: ReactNode;
  badge?: ReactNode;
};

/** Selection is controlled by the existing page/dialog state. */
export function NavItem({ collapsed = false, icon, selected = false, children, badge, className = "", ...props }: NavItemProps) {
  return (
    <ControlTooltip label={children} enabled={collapsed}><button {...props} type="button" className={`space nav-item${selected ? " active" : ""} ${className}`}
      data-selected={selected || undefined} aria-current={selected && !props["aria-haspopup"] ? "page" : undefined}>
      <span className="nav-item-icon" aria-hidden="true">{icon}</span>
      <span className="nav-item-label">{children}</span>
      {badge}
    </button></ControlTooltip>
  );
}
