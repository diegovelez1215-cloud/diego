import { useEffect, useRef, useState } from 'react';
import type { TournamentCampaign, TournamentFixture } from '../campaign/tournament';
import { teamFor } from '../campaign/tournament';
import { CanvasMatchRenderer, type MatchSemantic } from './CanvasMatchRenderer';
import './match-experience.css';

const initialSemantic: MatchSemantic = { phase: 'playing', minute: 0, second: 0, homeGoals: 0, awayGoals: 0, headline: 'Printing the match…', controlReady: false, openTargets: [], shotReady: false, event: 'Printing the match…' };

function clock(value: MatchSemantic) { return `${String(value.minute).padStart(2, '0')}:${String(value.second).padStart(2, '0')}`; }

/** The React surface is deliberately semantic-only; CanvasMatchRenderer owns every visual frame. */
export function MatchExperience({ campaign, fixture, reducedMotion, onComplete, onBack }: {
  campaign: TournamentCampaign; fixture: TournamentFixture; reducedMotion: boolean;
  onComplete: (score: { homeGoals: number; awayGoals: number }) => void; onBack: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null); const renderer = useRef<CanvasMatchRenderer | null>(null);
  const [semantic, setSemantic] = useState(initialSemantic); const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const home = teamFor(fixture.home); const away = teamFor(fixture.away);

  useEffect(() => {
    if (!canvas.current) return;
    const instance = new CanvasMatchRenderer(); renderer.current = instance;
    instance.mount(canvas.current); instance.setCallbacks({ onSemantic: setSemantic });
    instance.setMatch({ seed: campaign.seed + fixture.id.length * 97, home, away, tactics: campaign.tactics });
    instance.setReducedMotion(reducedMotion); instance.start();
    return () => { instance.destroy(); renderer.current = null; };
  }, [away, campaign.seed, campaign.tactics, fixture.id, home, reducedMotion]);

  const setPlaybackSpeed = (next: 1 | 2 | 4) => { renderer.current?.setSpeed(next); setSpeed(next); };
  return <main className="ywc-prototype ywc-visible-match" data-screen="match" data-renderer="canvas-2d" data-phase={semantic.phase} data-minute={semantic.minute} data-score={`${semantic.homeGoals}-${semantic.awayGoals}`} data-speed={speed}>
    <header className="ywc-match-header">
      <p>YOUR WORLD CUP · SIMULATED PERSONAL TOURNAMENT</p>
      <div className="ywc-match-score" aria-live="polite" aria-label={`${home.name} ${semantic.homeGoals}, ${away.name} ${semantic.awayGoals}, ${clock(semantic)}`}>
        <span>{home.code}</span><b>{semantic.homeGoals}<i>–</i>{semantic.awayGoals}</b><span>{away.code}</span>
      </div>
      <time dateTime={`PT${semantic.minute}M${semantic.second}S`}>{clock(semantic)}</time>
    </header>
    <section className="ywc-match-stage" aria-label={`${home.name} versus ${away.name} match presentation`}>
      <canvas ref={canvas} className="ywc-match-canvas" aria-label="Animated tactical football pitch. The visual match is rendered by Canvas." />
      <div className="ywc-match-context" aria-live="polite"><span>{semantic.phase === 'take-control' ? 'TAKE CONTROL' : fixture.stage.replaceAll('-', ' ').toUpperCase()}</span><strong>{semantic.headline}</strong><i>{semantic.event}</i></div>
      {semantic.controlReady ? <div className="ywc-canvas-control" role="region" aria-label="Take control">
        <strong>TAKE CONTROL</strong><b>{home.code} ATTACK · {clock(semantic)}</b><p>Create the chance. Tap an open teammate.</p>
        <div className="ywc-canvas-control__passes">{semantic.openTargets.map((target) => <button type="button" key={target.id} onClick={() => renderer.current?.requestPass(target.id)}>{target.label} open</button>)}</div>
        <div className="ywc-canvas-control__shots" aria-label="Shot zones">{(['left', 'center', 'right'] as const).map((zone) => <button type="button" disabled={!semantic.shotReady} key={zone} onClick={() => renderer.current?.requestShot(zone)}>Shoot {zone}</button>)}</div>
        <small>Keyboard parity: Tab to choose a pass or shot. The match resumes only after your outcome.</small>
      </div> : null}
      {semantic.phase === 'full-time' ? <div className="ywc-canvas-full-time" role="status"><strong>FULL TIME</strong><p>{home.code} {semantic.homeGoals}–{semantic.awayGoals} {away.code}</p><button type="button" onClick={() => onComplete({ homeGoals: semantic.homeGoals, awayGoals: semantic.awayGoals })}>Pin result to campaign wall</button></div> : null}
    </section>
    <aside className="ywc-match-rail" aria-label="Match controls"><div className="ywc-speed-control" role="group" aria-label="Playback speed">{([1, 2, 4] as const).map((value) => <button type="button" key={value} className={speed === value ? 'is-selected' : ''} aria-pressed={speed === value} onClick={() => setPlaybackSpeed(value)}>{value}×</button>)}</div><button type="button" onClick={onBack}>Back to tactics</button><p>Canvas owns the pitch, players, ball, camera, and effects. This rail updates only for match events and the throttled clock.</p></aside>
  </main>;
}
