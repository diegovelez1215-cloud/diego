import type { ReactNode } from 'react';
import type { SnapshotState } from '../data/snapshot-state';
import { BottomNav } from './BottomNav';
import { SourceChip } from './SourceChip';
import { TopBar } from './TopBar';

export const primaryDestinations = [
  { path: '/v2/', label: 'Matchday', icon: 'matchday' },
  { path: '/v2/tournament', label: 'Tournament', icon: 'tournament' },
  { path: '/v2/play', label: 'Play', icon: 'play' },
  { path: '/v2/you', label: 'You', icon: 'you' },
] as const;

export type PrimaryPath = typeof primaryDestinations[number]['path'];

export function AppShell({ children, currentPath, snapshotState, refreshing, showMatchdayEdition, onRefresh, onNavigate }: {
  children: ReactNode;
  currentPath: PrimaryPath | null;
  snapshotState: SnapshotState;
  refreshing: boolean;
  showMatchdayEdition: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="v2-app">
      <a className="v2-skip-link" href="#v2-content">Skip to content</a>
      <TopBar
        source={<SourceChip state={snapshotState} refreshing={refreshing} onRefresh={onRefresh} />}
        showEditionContext={showMatchdayEdition}
        onNavigate={onNavigate}
      />
      <div className="v2-content-frame">{children}</div>
      <BottomNav currentPath={currentPath} onNavigate={onNavigate} />
    </div>
  );
}
