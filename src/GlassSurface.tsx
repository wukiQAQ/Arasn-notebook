import type { ComponentPropsWithRef } from "react";

/** One glass layer per floating surface; child controls stay transparent. */
export function GlassSurface({ className = "", ...props }: ComponentPropsWithRef<"div">) {
  return <div {...props} className={`glass-surface ${className}`} />;
}
