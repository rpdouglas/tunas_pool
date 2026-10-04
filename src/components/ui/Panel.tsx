import type { ReactNode } from 'react';

export interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title ? <h2 className="panel-title">{title}</h2> : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
