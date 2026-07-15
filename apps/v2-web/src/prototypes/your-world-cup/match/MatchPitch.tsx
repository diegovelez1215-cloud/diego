import type { CSSProperties } from 'react';
import type { Point, TeamId } from './engine';
import type { ShotZone } from '../campaign/contracts';

export type RenderPlayer = Readonly<{
  id: string;
  teamId: TeamId;
  number: number;
  shortLabel: string;
  role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
  position: Point;
  facing: 'up' | 'down';
  active?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  lane?: 'open' | 'closed' | 'carrier';
  accessibleName?: string;
}>;

const position = (point: Point) => ({ '--player-x': `${point.x}%`, '--player-y': `${point.y}%` } as CSSProperties);

export function MatchPitch({ players, ball, onPlayer, shotZones, statusLabel }: {
  players: readonly RenderPlayer[];
  ball: Point;
  onPlayer?: (id: string) => void;
  shotZones?: Readonly<{ enabled: boolean; onShoot: (zone: ShotZone) => void }>;
  statusLabel: string;
}) {
  return (
    <section className="ywc-match-pitch" aria-label={statusLabel}>
      <svg className="ywc-pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="1" y="1" width="98" height="98" />
        <line x1="1" y1="50" x2="99" y2="50" />
        <ellipse cx="50" cy="50" rx="12" ry="9" />
        <circle cx="50" cy="50" r=".9" />
        <rect x="24" y="1" width="52" height="15" />
        <rect x="36" y="1" width="28" height="6" />
        <rect x="24" y="84" width="52" height="15" />
        <rect x="36" y="94" width="28" height="5" />
        <path d="M42 16 A10 7 0 0 0 58 16 M42 84 A10 7 0 0 1 58 84" />
      </svg>
      <div className="ywc-goal-mouth ywc-goal-mouth--north" aria-hidden="true" />
      <div className="ywc-goal-mouth ywc-goal-mouth--south" aria-hidden="true" />
      {shotZones?.enabled ? (
        <div className="ywc-match-goal-zones" aria-label="Choose a goal zone">
          {(['left', 'center', 'right'] as const).map((zone) => <button type="button" key={zone} onClick={() => shotZones.onShoot(zone)} aria-label={`Shoot ${zone} goal zone`} />)}
        </div>
      ) : null}
      {players.map((player) => {
        const className = `ywc-match-player is-${player.teamId} is-${player.role}${player.active ? ' is-active' : ''}${player.lane ? ` is-${player.lane}` : ''}`;
        const contents = <><span className="ywc-shirt" aria-hidden="true"><b>{player.number}</b></span><small>{player.shortLabel}</small>{player.lane === 'closed' ? <i aria-hidden="true">×</i> : null}</>;
        return player.interactive ? (
          <button type="button" className={className} style={position(player.position)} key={player.id} disabled={player.disabled} onClick={() => onPlayer?.(player.id)} aria-label={player.accessibleName}>{contents}</button>
        ) : (
          <div className={className} style={position(player.position)} key={player.id} aria-hidden="true">{contents}</div>
        );
      })}
      <div className="ywc-match-ball" style={position(ball)} aria-hidden="true"><span /></div>
    </section>
  );
}
