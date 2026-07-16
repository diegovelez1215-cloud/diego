import type { CSSProperties } from 'react';
import type { BallState, Point, TeamId } from './engine';
import type { ShotZone } from '../campaign/contracts';

export type RenderPlayer = Readonly<{
  id: string;
  teamId: TeamId;
  number: number;
  shortLabel: string;
  role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
  position: Point;
  facing: 'up' | 'down';
  facingDegrees?: number;
  active?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  supporting?: boolean;
  lane?: 'open' | 'closed' | 'carrier';
  accessibleName?: string;
}>;

const position = (point: Point, facingDegrees = 0) => ({ '--player-x': `${point.x}%`, '--player-y': `${point.y}%`, '--player-facing': `${facingDegrees}deg` } as CSSProperties);
const ballPosition = (point: Point, height: number, rotation: number) => ({ '--player-x': `${point.x}%`, '--player-y': `${point.y}%`, '--ball-lift': `${Math.round(height * 15)}px`, '--ball-scale': 1 + (height * .38), '--ball-rotation': `${rotation}deg` } as CSSProperties);

export function MatchPitch({ players, ball, ballHeight = 0, ballRotation = 0, ballState = 'grounded', onPlayer, shotZones, statusLabel, controlReady = false }: {
  players: readonly RenderPlayer[];
  ball: Point;
  ballHeight?: number;
  ballRotation?: number;
  ballState?: BallState;
  onPlayer?: (id: string) => void;
  shotZones?: Readonly<{ enabled: boolean; onShoot: (zone: ShotZone) => void }>;
  statusLabel: string;
  controlReady?: boolean;
}) {
  const carrier = players.find((player) => player.lane === 'carrier');
  const lanes = carrier ? players.filter((player) => player.lane === 'open' || player.lane === 'closed') : [];
  return (
    <section className={`ywc-match-pitch${controlReady ? ' is-control-ready' : ''}`} aria-label={statusLabel} data-ball-x={ball.x.toFixed(3)} data-ball-y={ball.y.toFixed(3)} data-ball-height={ballHeight.toFixed(3)} data-ball-state={ballState}>
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
      {ballState === 'net' ? <div className={`ywc-net-ripple ${ball.y < 50 ? 'is-north' : 'is-south'}`} aria-hidden="true" /> : null}
      {carrier && lanes.length ? <svg className="ywc-control-lanes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{lanes.map((player) => <line key={player.id} className={`is-${player.lane}`} x1={carrier.position.x} y1={carrier.position.y} x2={player.position.x} y2={player.position.y} />)}</svg> : null}
      {shotZones?.enabled ? (
        <div className="ywc-match-goal-zones" aria-label="Choose a goal zone">
          {(['left', 'center', 'right'] as const).map((zone) => <button type="button" key={zone} onClick={() => shotZones.onShoot(zone)} aria-label={`Shoot ${zone} goal zone`} />)}
        </div>
      ) : null}
      {players.map((player) => {
        const className = `ywc-match-player is-${player.teamId} is-${player.role} is-facing-${player.facing}${player.active ? ' is-active' : ''}${player.supporting ? ' is-supporting' : ''}${player.lane ? ` is-${player.lane}` : ''}`;
        const contents = <><span className="ywc-shirt" aria-hidden="true"><b>{player.number}</b></span><small>{player.shortLabel}</small>{player.lane === 'closed' ? <i aria-hidden="true">×</i> : null}</>;
        return player.interactive ? (
          <button type="button" className={className} style={position(player.position, player.facingDegrees)} key={player.id} disabled={player.disabled} onClick={() => onPlayer?.(player.id)} aria-label={player.accessibleName} data-player-id={player.id} data-team-id={player.teamId}>{contents}</button>
        ) : (
          <div className={className} style={position(player.position, player.facingDegrees)} key={player.id} aria-hidden="true" data-player-id={player.id} data-team-id={player.teamId}>{contents}</div>
        );
      })}
      <div className={`ywc-match-ball is-${ballState}`} style={ballPosition(ball, ballHeight, ballRotation)} aria-hidden="true"><span /></div>
    </section>
  );
}
