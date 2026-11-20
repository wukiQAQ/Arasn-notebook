import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  meta?: ReactNode;
  description?: string;
  leading?: ReactNode;
  titleAction?: ReactNode;
  actions?: ReactNode;
  className?: string;
  level?: 1 | 2;
  titleId?: string;
};

/** A page owns its title; child tools and content only label their own tasks. */
export function PageHeader({ title, meta, description, leading, titleAction, actions, className = "", level = 1, titleId }: PageHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  const heading = <Heading id={titleId} className="page-header-title xigra-workbench-title">
    <span>{title}</span>{meta !== undefined && meta !== null && <small className="page-header-meta"> · {meta}</small>}
  </Heading>;
  return <header className={`page-header ${className}`}>
    <div className="page-header-identity">
      {leading}
      <div className="page-header-copy">
        {titleAction ? <div className="page-header-title-row">{heading}{titleAction}</div> : heading}
        {description && <p className="page-header-description">{description}</p>}
      </div>
    </div>
    {actions}
  </header>;
}
