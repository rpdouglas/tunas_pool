import type { ReactNode } from 'react';

export function SectionBar({ children }: { children: ReactNode }) {
  return <h2 className="section-bar">{children}</h2>;
}
