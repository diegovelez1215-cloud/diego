import { Component, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useOfficialSnapshot } from '../data/official-snapshot';
import { MatchdayRoute } from '../routes/Matchday';
import { MatchDetailRoute } from '../routes/MatchDetail';
import { TournamentRoute } from '../routes/Tournament';
import { PlayRoute } from '../routes/Play';
import { YouRoute } from '../routes/You';
import { AppShell, primaryDestinations, type PrimaryPath } from '../ui/AppShell';
import { StatePanel } from '../ui/StatePanel';

function normalizedPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/v2' ? '/v2/' : path;
}

function primaryPathFor(pathname: string): PrimaryPath | null {
  const path = normalizedPath(pathname);
  return primaryDestinations.some((item) => item.path === path) ? path as PrimaryPath : null;
}

function matchFixtureId(pathname: string): number | null {
  const hit = /^\/v2\/match\/(\d+)\/?$/.exec(pathname);
  return hit ? Number(hit[1]) : null;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return (
        <main className="v2-emergency" role="alert">
          <StatePanel
            kind="error"
            headingLevel={1}
            eyebrow="Product shell error"
            title="United needs another try."
            description="The route could not be displayed. Retry here, or return to the verified Matchday surface."
            action={<button type="button" className="v2-button v2-button--primary" onClick={this.retry}>Retry</button>}
          />
          <a className="v2-button v2-button--quiet" href="/v2/">Go to Matchday</a>
        </main>
      );
    }
    return this.props.children;
  }
}

function OfficialRoute({ fixtureId, snapshot, onNavigate, onBack }: {
  fixtureId: number | null;
  snapshot: ReturnType<typeof useOfficialSnapshot>;
  onNavigate: (path: string) => void;
  onBack: () => void;
}) {
  if (fixtureId != null) {
    return <MatchDetailRoute fixtureId={fixtureId} snapshotState={snapshot.state} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={onNavigate} onBack={onBack} />;
  }
  return <MatchdayRoute snapshotState={snapshot.state} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={onNavigate} />;
}

export function App() {
  const snapshot = useOfficialSnapshot();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const primaryPath = primaryPathFor(pathname);
  const fixtureId = matchFixtureId(normalizedPath(pathname));
  const routeTitle = fixtureId != null
    ? 'Match detail'
    : primaryDestinations.find((item) => item.path === primaryPath)?.label || 'Not found';

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', updatePathname);
    return () => window.removeEventListener('popstate', updatePathname);
  }, []);

  useEffect(() => {
    document.title = `${routeTitle} — United 2026`;
  }, [routeTitle]);

  const navigateTo = useCallback((path: string) => {
    if (normalizedPath(window.location.pathname) === normalizedPath(path)) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    window.history.pushState({ unitedV2Navigation: true }, '', path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const backFromDetail = useCallback(() => {
    if (window.history.state?.unitedV2Navigation) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, '', '/v2/');
    setPathname('/v2/');
  }, []);

  return (
    <RootErrorBoundary>
      <AppShell currentPath={primaryPath} snapshotState={snapshot.state} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={navigateTo}>
        {primaryPath || fixtureId != null ? (
          <main className="v2-main" id="v2-content" tabIndex={-1} key={normalizedPath(pathname)}>
            {primaryPath === '/v2/tournament' ? <TournamentRoute snapshotState={snapshot.state} onNavigate={navigateTo} /> : null}
            {primaryPath === '/v2/play' ? <PlayRoute /> : null}
            {primaryPath === '/v2/you' ? <YouRoute onNavigate={navigateTo} /> : null}
            {(primaryPath === '/v2/' || fixtureId != null) ? <OfficialRoute fixtureId={fixtureId} snapshot={snapshot} onNavigate={navigateTo} onBack={backFromDetail} /> : null}
          </main>
        ) : (
          <main className="v2-main" id="v2-content" tabIndex={-1}>
            <StatePanel
              kind="not-found"
              headingLevel={1}
              eyebrow="Route not found"
              title="This destination is off the ledger."
              description="The address does not match Matchday, Tournament, Play, You, or a canonical fixture."
              action={<button type="button" className="v2-button v2-button--primary" onClick={() => navigateTo('/v2/')}>Return to Matchday</button>}
            />
          </main>
        )}
      </AppShell>
    </RootErrorBoundary>
  );
}
