import type { ReactNode } from 'react';

export function TopBar({ routeTitle, children }: { routeTitle: string; children: ReactNode }) {
  return (
    <header className="v2-topbar">
      <a className="v2-wordmark" href="/v2/" aria-label="United 2026 Matchday">United <strong>26</strong></a>
      {children}
      <p className="v2-edition"><span aria-hidden="true">{routeTitle}</span><strong>World Cup</strong></p>
    </header>
  );
}
