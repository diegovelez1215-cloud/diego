import type { MouseEvent, ReactNode } from 'react';

export function TopBar({ source, showEditionContext, onNavigate }: {
  source: ReactNode;
  showEditionContext: boolean;
  onNavigate: (path: string) => void;
}) {
  function openMatchday(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate('/v2/');
  }

  return (
    <header className="v2-topbar">
      <a className="v2-wordmark" href="/v2/" aria-label="United 2026 Matchday" onClick={openMatchday}>
        <span className="v2-wordmark__name">United <strong>26</strong></span>
        {showEditionContext ? <span className="v2-edition-context">48 teams · 104 matches · CAN/MEX/USA</span> : null}
      </a>
      {source}
    </header>
  );
}
