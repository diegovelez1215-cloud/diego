import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';

export const primaryDestinations = [
  { path: '/v2/', label: 'Matchday', icon: 'matchday' },
  { path: '/v2/tournament', label: 'Tournament', icon: 'tournament' },
  { path: '/v2/play', label: 'Play', icon: 'play' },
  { path: '/v2/you', label: 'You', icon: 'you' },
] as const;

export type PrimaryPath = typeof primaryDestinations[number]['path'];

export function AppShell({ children, currentPath, routeTitle, onNavigate }: {
  children: ReactNode;
  currentPath: PrimaryPath | null;
  routeTitle: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="v2-app">
      <a className="v2-skip-link" href="#v2-content">Skip to content</a>
      <TopBar routeTitle={routeTitle} />
      <div className="v2-content-frame">{children}</div>
      <BottomNav currentPath={currentPath} onNavigate={onNavigate} />
    </div>
  );
}
