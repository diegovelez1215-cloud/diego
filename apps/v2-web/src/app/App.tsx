import { Component, type MouseEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

type Destination = {
  path: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
};

const destinations: Destination[] = [
  {
    path: '/v2/',
    label: 'Matchday',
    eyebrow: 'Matchday',
    title: 'Matchday is being rebuilt.',
    description: 'The V2 Matchday foundation is ready for its future verified match experience.',
  },
  {
    path: '/v2/tournament',
    label: 'Tournament',
    eyebrow: 'Tournament',
    title: 'Tournament is being rebuilt.',
    description: 'The V2 Tournament foundation will connect to trusted competition structure in a later package.',
  },
  {
    path: '/v2/play',
    label: 'Play',
    eyebrow: 'Play',
    title: 'Play is being rebuilt.',
    description: 'The V2 Play foundation is intentionally empty while future experiences are designed and tested.',
  },
  {
    path: '/v2/you',
    label: 'You',
    eyebrow: 'You',
    title: 'You is being rebuilt.',
    description: 'The V2 You foundation will become a record space only after identity and privacy work is ready.',
  },
];

function normalizedPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/v2' ? '/v2/' : path;
}

function destinationFor(pathname: string) {
  return destinations.find((destination) => destination.path === normalizedPath(pathname));
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

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const destination = destinationFor(pathname);

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

  return (
    <RootErrorBoundary>
      <div className="v2-app">
        <header className="v2-header">
          <p className="v2-product">United 2026 <span>V2</span></p>
          <p className="v2-status">Foundation</p>
        </header>
        {destination ? (
          <main className="v2-main" id="v2-content" role="tabpanel" tabIndex={-1}>
            <p className="v2-eyebrow">{destination.eyebrow}</p>
            <h1>{destination.title}</h1>
            <p className="v2-description">{destination.description}</p>
            <p className="v2-note">No live tournament data, games, rankings, or profiles are available in this foundation.</p>
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
