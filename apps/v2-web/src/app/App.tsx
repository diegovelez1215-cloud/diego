import { Component, type MouseEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useOfficialSnapshot } from '../data/official-snapshot';
import { MatchdayRoute } from '../routes/Matchday';
import { MatchDetailRoute } from '../routes/MatchDetail';
import { TournamentRoute } from '../routes/Tournament';
import { PlayRoute } from '../routes/Play';
import { YouRoute } from '../routes/You';

type Destination = {
  path: string;
  label: string;
};

const destinations: Destination[] = [
  {
    path: '/v2/',
    label: 'Matchday',
  },
  {
    path: '/v2/tournament',
    label: 'Tournament',
  },
  {
    path: '/v2/play',
    label: 'Play',
  },
  {
    path: '/v2/you',
    label: 'You',
  },
];

function normalizedPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/v2' ? '/v2/' : path;
}

function destinationFor(pathname: string) {
  return destinations.find((destination) => destination.path === normalizedPath(pathname));
}

function matchFixtureId(pathname: string): number | null {
  const hit = /^\/v2\/match\/(\d+)\/?$/.exec(pathname);
  return hit ? Number(hit[1]) : null;
}

function RootErrorBoundary({ children }: { children: ReactNode }) {
  return <Boundary>{children}</Boundary>;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (this.state.failed) {
      return (
        <main className="v2-error" role="alert">
          <p className="v2-eyebrow">United 2026 V2</p>
          <h1>This area needs another try.</h1>
          <p>Use retry to restore the V2 foundation, or return to Matchday.</p>
          <div className="v2-actions">
            <button type="button" onClick={this.retry}>Retry</button>
            <a href="/v2/">Go to Matchday</a>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

function OfficialRoute({ fixtureId, onNavigate }: { fixtureId: number | null; onNavigate: (path: string) => void }) {
  const snapshot = useOfficialSnapshot();
  if (fixtureId != null) {
    return <MatchDetailRoute fixtureId={fixtureId} snapshotState={snapshot.state} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={onNavigate} />;
  }
  return <MatchdayRoute snapshotState={snapshot.state} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={onNavigate} />;
}

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const destination = destinationFor(pathname);
  const fixtureId = matchFixtureId(normalizedPath(pathname));

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', updatePathname);
    return () => window.removeEventListener('popstate', updatePathname);
  }, []);

  const navigate = useCallback((event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState({}, '', path);
    setPathname(path);
  }, []);

  const navigateTo = useCallback((path: string) => {
    if (normalizedPath(window.location.pathname) === normalizedPath(path)) return;
    window.history.pushState({}, '', path);
    setPathname(path);
  }, []);

  return (
    <RootErrorBoundary>
      <div className="v2-app">
        <header className="v2-header">
          <p className="v2-product">United 2026 <span>V2</span></p>
          <p className="v2-status">Match Ledger</p>
        </header>
        {destination || fixtureId != null ? (
          <main className="v2-main" id="v2-content" role="tabpanel" tabIndex={-1}>
            {destination?.path === '/v2/tournament' ? <TournamentRoute /> : null}
            {destination?.path === '/v2/play' ? <PlayRoute /> : null}
            {destination?.path === '/v2/you' ? <YouRoute /> : null}
            {(destination?.path === '/v2/' || fixtureId != null) ? <OfficialRoute fixtureId={fixtureId} onNavigate={navigateTo} /> : null}
          </main>
        ) : (
          <main className="v2-main v2-not-found" id="v2-content" role="status" tabIndex={-1}>
            <p className="v2-eyebrow">Not found</p>
            <h1>That V2 destination is not here.</h1>
            <p className="v2-description">This foundation only includes Matchday, Tournament, Play, and You.</p>
            <a className="v2-primary-link" href="/v2/" onClick={(event) => navigate(event, '/v2/')}>Return to Matchday</a>
          </main>
        )}
        <nav className="v2-bottom-nav" aria-label="United 2026 V2 destinations" role="tablist">
          {destinations.map((item) => {
            const selected = destination?.path === item.path;
            return (
              <a
                className="v2-tab"
                href={item.path}
                key={item.path}
                role="tab"
                aria-controls="v2-content"
                aria-selected={selected}
                onClick={(event) => navigate(event, item.path)}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    </RootErrorBoundary>
  );
}
