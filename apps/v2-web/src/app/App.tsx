import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOfficialSnapshot } from '../data/official-snapshot';
import { snapshotFromState } from '../data/snapshot-state';
import { canonicalTournamentSnapshot } from '../domain/tournament-bridge';
import { fixtureByCanonicalId, gradePrediction, predictionCounts } from '../predictions/prediction-bridge';
import { readPredictionStore } from '../predictions/prediction-store';
import type { LocalPrediction } from '../predictions/contracts';
import { MatchdayRoute } from '../routes/Matchday';
import { MatchDetailRoute } from '../routes/MatchDetail';
import { PredictionDetailRoute } from '../routes/PredictionDetail';
import { PredictionsRoute } from '../routes/Predictions';
import { TournamentRoute } from '../routes/Tournament';
import { PlayRoute } from '../routes/Play';
import { YouRoute } from '../routes/You';
import { AppShell, primaryDestinations, type PrimaryPath } from '../ui/AppShell';
import { StatePanel } from '../ui/StatePanel';
import { AuthProvider } from '../auth/auth-provider';

function normalizedPath(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/v2' ? '/v2/' : path;
}

function primaryPathFor(pathname: string): PrimaryPath | null {
  const path = normalizedPath(pathname);
  if (/^\/v2\/predictions(?:\/\d+)?$/.test(path)) return '/v2/play';
  if (/^\/v2\/match\/\d+$/.test(path)) return '/v2/';
  return primaryDestinations.some((item) => item.path === path) ? path as PrimaryPath : null;
}

function matchFixtureId(pathname: string): number | null {
  const hit = /^\/v2\/match\/(\d+)\/?$/.exec(pathname);
  return hit ? Number(hit[1]) : null;
}

function predictionFixtureId(pathname: string): number | null {
  const hit = /^\/v2\/predictions\/(\d+)\/?$/.exec(pathname);
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

function OfficialRoute({ fixtureId, snapshot, predictionRecords, onNavigate, onBack }: {
  fixtureId: number | null;
  snapshot: ReturnType<typeof useOfficialSnapshot>;
  predictionRecords: readonly LocalPrediction[];
  onNavigate: (path: string) => void;
  onBack: () => void;
}) {
  if (fixtureId != null) {
    return <MatchDetailRoute fixtureId={fixtureId} snapshotState={snapshot.state} predictionRecords={predictionRecords} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={onNavigate} onBack={onBack} />;
  }
  return <MatchdayRoute snapshotState={snapshot.state} refreshing={snapshot.refreshing} onRefresh={snapshot.refresh} onNavigate={onNavigate} />;
}

function AppRoutes() {
  const snapshot = useOfficialSnapshot();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const tournamentSnapshot = useMemo(() => snapshotFromState(snapshot.state) || canonicalTournamentSnapshot(), [snapshot.state]);
  const [predictionRecords, setPredictionRecords] = useState(() => readPredictionStore(window.localStorage, canonicalTournamentSnapshot().fixtures).store.records);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const primaryPath = primaryPathFor(pathname);
  const fixtureId = matchFixtureId(normalizedPath(pathname));
  const predictionId = predictionFixtureId(normalizedPath(pathname));
  const predictionsPath = normalizedPath(pathname) === '/v2/predictions';
  const localPredictionProjection = useMemo(() => {
    const counts = predictionCounts(tournamentSnapshot, predictionRecords);
    const history = predictionRecords.slice().sort((a, b) => b.fixtureId - a.fixtureId).slice(0, 6).flatMap((record) => {
      const fixture = fixtureByCanonicalId(tournamentSnapshot, record.fixtureId);
      if (!fixture) return [];
      const grade = gradePrediction(record, fixture);
      return [{
        fixtureId: record.fixtureId,
        fixtureLabel: `${fixture.home.kind === 'team' ? fixture.home.name : fixture.home.label} v ${fixture.away.kind === 'team' ? fixture.away.name : fixture.away.label}`,
        state: grade.state,
      }];
    });
    return Object.freeze({ ...counts, hasPredictions: predictionRecords.length > 0, history: Object.freeze(history) });
  }, [predictionRecords, tournamentSnapshot]);
  const routeTitle = predictionId != null
    ? 'Prediction detail'
    : predictionsPath
      ? 'Predictions'
      : fixtureId != null
    ? 'Match detail'
    : primaryDestinations.find((item) => item.path === primaryPath)?.label || 'Not found';

  const refreshPredictionRecords = useCallback(() => {
    setPredictionRecords(readPredictionStore(window.localStorage, tournamentSnapshot.fixtures).store.records);
  }, [tournamentSnapshot]);

  useEffect(() => { refreshPredictionRecords(); }, [refreshPredictionRecords]);

  useEffect(() => {
    const updatePathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', updatePathname);
    return () => window.removeEventListener('popstate', updatePathname);
  }, []);

  useEffect(() => {
    document.title = `${routeTitle} — United 2026`;
  }, [routeTitle]);

  useEffect(() => {
    if (previousPath.current !== pathname) mainRef.current?.focus({ preventScroll: true });
    previousPath.current = pathname;
  }, [pathname]);

  const navigateTo = useCallback((path: string) => {
    if (normalizedPath(window.location.pathname) === normalizedPath(path)) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    window.history.pushState({ unitedV2Navigation: true }, '', path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const backFromDetail = useCallback((fallbackPath: '/v2/' | '/v2/predictions') => {
    if (window.history.state?.unitedV2Navigation) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, '', fallbackPath);
    setPathname(fallbackPath);
  }, []);
  const backFromMatch = useCallback(() => backFromDetail('/v2/'), [backFromDetail]);
  const backFromPrediction = useCallback(() => backFromDetail('/v2/predictions'), [backFromDetail]);

  return (
    <RootErrorBoundary>
      <AppShell currentPath={primaryPath} snapshotState={snapshot.state} refreshing={snapshot.refreshing} showMatchdayEdition={normalizedPath(pathname) === '/v2/'} onRefresh={snapshot.refresh} onNavigate={navigateTo}>
        {primaryPath || fixtureId != null || predictionId != null || predictionsPath ? (
          <main className="v2-main" id="v2-content" tabIndex={-1} key={normalizedPath(pathname)} ref={mainRef}>
            {primaryPath === '/v2/tournament' ? <TournamentRoute snapshotState={snapshot.state} onNavigate={navigateTo} /> : null}
            {predictionsPath ? <PredictionsRoute snapshot={tournamentSnapshot} records={predictionRecords} onNavigate={navigateTo} /> : null}
            {predictionId != null ? <PredictionDetailRoute fixtureId={predictionId} snapshot={tournamentSnapshot} records={predictionRecords} onRecordsChange={refreshPredictionRecords} onBack={backFromPrediction} /> : null}
            {primaryPath === '/v2/play' && !predictionsPath && predictionId == null ? <PlayRoute predictions={localPredictionProjection} onNavigate={navigateTo} /> : null}
            {primaryPath === '/v2/you' ? <AuthProvider><YouRoute predictions={localPredictionProjection} onNavigate={navigateTo} /></AuthProvider> : null}
            {(primaryPath === '/v2/' || fixtureId != null) ? <OfficialRoute fixtureId={fixtureId} snapshot={snapshot} predictionRecords={predictionRecords} onNavigate={navigateTo} onBack={backFromMatch} /> : null}
          </main>
        ) : (
          <main className="v2-main" id="v2-content" tabIndex={-1} ref={mainRef}>
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

export function App() {
  return <AppRoutes />;
}
