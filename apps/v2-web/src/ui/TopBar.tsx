import type { ReactNode } from 'react';

export function TopBar({ source }: { source: ReactNode }) {
  return (
    <header className="v2-topbar">
      <a className="v2-wordmark" href="/v2/" aria-label="United 2026 Matchday">United <strong>26</strong></a>
      {source}
    </header>
  );
}
