export function TopBar({ routeTitle }: { routeTitle: string }) {
  return (
    <header className="v2-topbar">
      <a className="v2-wordmark" href="/v2/" aria-label="United 2026 Matchday">United <strong>26</strong></a>
      <p className="v2-route-context" aria-hidden="true">{routeTitle}</p>
      <p className="v2-edition">World Cup</p>
    </header>
  );
}
