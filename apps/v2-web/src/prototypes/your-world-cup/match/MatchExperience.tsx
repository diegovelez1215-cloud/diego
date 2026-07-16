import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignStateV2, CompletedMatch, MatchCheckpoint, MatchPhase, MatchSpeed, MomentProgress, PlayerId, ShotZone } from '../campaign/contracts';
import { replayMoment } from '../campaign/moment-engine';
import { completeMatch, simulateMatch } from '../campaign/simulation';
import { buildPresentationFrames, createMatchPlan, injectPivotalOutcome, nextMeaningfulTick, type MatchFrame } from './engine';
import { campaignFixture } from '../campaign/match-data';
import { MatchPitch, type RenderPlayer } from './MatchPitch';
import './match-experience.css';

const PLAYER_NAMES: Record<PlayerId, string> = { lw: 'Luna', ten: 'Ocampo', rw: 'Garay', st: 'Ferreyra' };
const MATCH_IDS: Record<PlayerId, string> = { lw: 'arg-lw', ten: 'arg-ten', rw: 'arg-rw', st: 'arg-st' };
const MOMENT_IDS: Record<string, PlayerId> = Object.fromEntries(Object.entries(MATCH_IDS).map(([moment, match]) => [match, moment])) as Record<string, PlayerId>;

function phaseForTick(tick: number, frames: readonly MatchFrame[], pivotalTick: number): MatchPhase {
  const action = frames[tick]?.action;
  if (action?.type === 'phase' && action.phase === 'halftime') return 'halftime';
  if (tick < pivotalTick && frames[tick]?.minute < 45) return 'first-half';
  if (tick < pivotalTick) return 'second-half';
  if (tick === pivotalTick) return 'pivotal';
  if (action?.type === 'phase' && action.phase === 'full-time') return 'full-time';
  if (tick >= frames.length - 1) return 'full-time';
  if (tick > pivotalTick) return 'closing';
  return 'first-half';
}

function eventLabel(frame: MatchFrame) {
  if (!frame.action) return 'Open play';
  return frame.action.type === 'phase' ? (frame.action.phase ?? 'phase').replace('-', ' ') : frame.action.type;
}

function checkpoint(tick: number, speed: MatchSpeed, phase: MatchPhase, moment: MomentProgress, momentOutcome: MatchCheckpoint['momentOutcome']): MatchCheckpoint {
  return { planVersion: 1, fixtureId: 'arg-nga', tick, speed, phase, moment, momentOutcome };
}

export function MatchExperience({ campaign, reducedMotion, onCheckpoint, onComplete, onBack }: {
  campaign: CampaignStateV2;
  reducedMotion: boolean;
  onCheckpoint: (next: MatchCheckpoint) => void;
  onComplete: (match: CompletedMatch) => void;
  onBack: () => void;
}) {
  const tactics = campaign.tactics!;
  const [tick, setTick] = useState(campaign.match.tick);
  const [speed, setSpeed] = useState<MatchSpeed>(campaign.match.speed);
  const [phase, setPhase] = useState<MatchPhase>(campaign.match.phase);
  const [playing, setPlaying] = useState(campaign.match.phase !== 'halftime' && campaign.match.phase !== 'pivotal' && campaign.match.phase !== 'full-time');
  const [momentProgress, setMomentProgress] = useState(campaign.match.moment);
  const [momentOutcome, setMomentOutcome] = useState(campaign.match.momentOutcome);
  const [inputLocked, setInputLocked] = useState(false);
  const completed = useRef(false);
  const input = useMemo(() => ({ fixtureId: campaign.match.fixtureId, campaignSeed: campaign.seed, home: campaignFixture.home, away: campaignFixture.away, tactics }), [campaign.match.fixtureId, campaign.seed, tactics]);
  const plan = useMemo(() => injectPivotalOutcome(createMatchPlan(input), input, momentOutcome), [input, momentOutcome]);
  const frames = useMemo(() => buildPresentationFrames(plan, input), [input, plan]);
  const pivotalTick = useMemo(() => Math.max(0, frames.findIndex((candidate) => candidate.action?.type === 'pivotal-entry')), [frames]);
  const safeTick = Math.min(tick, frames.length - 1);
  const frame = frames[safeTick];
  const momentState = useMemo(() => replayMoment(campaign.seed, tactics, momentProgress), [campaign.seed, momentProgress, tactics]);

  const save = useCallback((nextTick: number, nextPhase = phase, nextMoment = momentProgress, nextOutcome = momentOutcome, nextSpeed = speed) => {
    onCheckpoint(checkpoint(nextTick, nextSpeed, nextPhase, nextMoment, nextOutcome));
  }, [momentOutcome, momentProgress, onCheckpoint, phase, speed]);

  const moveTo = useCallback((nextTick: number) => {
    const bounded = Math.min(frames.length - 1, Math.max(0, nextTick));
    const nextPhase = phaseForTick(bounded, frames, pivotalTick);
    setTick(bounded);
    setPhase(nextPhase);
    if (nextPhase === 'halftime' || nextPhase === 'pivotal' || nextPhase === 'full-time') setPlaying(false);
    if (frames[bounded].meaningful || bounded % 6 === 0 || ['halftime', 'pivotal', 'full-time'].includes(nextPhase)) save(bounded, nextPhase);
  }, [frames, pivotalTick, save]);

  useEffect(() => {
    if (!playing || phase === 'pivotal' || safeTick >= frames.length - 1) return;
    const timer = window.setTimeout(() => moveTo(safeTick + 1), (reducedMotion ? 120 : 220) / speed);
    return () => window.clearTimeout(timer);
  }, [frames.length, moveTo, phase, playing, reducedMotion, safeTick, speed]);

  useEffect(() => {
    if (phase !== 'pivotal' || momentState.outcome) return;
    const timer = window.setTimeout(() => {
      const next = { ...momentProgress, tick: Math.min(momentState.limit, momentProgress.tick + 1) };
      setMomentProgress(next);
      save(tick, 'pivotal', next, null);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [momentProgress, momentState.limit, momentState.outcome, phase, save, tick]);

  useEffect(() => {
    if (!inputLocked) return;
    const timer = window.setTimeout(() => setInputLocked(false), reducedMotion ? 80 : 260);
    return () => window.clearTimeout(timer);
  }, [inputLocked, reducedMotion]);

  useEffect(() => {
    if (phase !== 'pivotal' || (!momentState.outcome && !momentOutcome)) return;
    const outcome = momentOutcome ?? momentState.outcome!;
    if (!momentOutcome) {
      setMomentOutcome(outcome);
      save(tick, 'pivotal', momentProgress, outcome);
    }
    const timer = window.setTimeout(() => {
      setTick(Math.min(frames.length - 1, pivotalTick + 1));
      setPhase('closing');
      setPlaying(true);
      save(Math.min(frames.length - 1, pivotalTick + 1), 'closing', momentProgress, outcome);
    }, reducedMotion ? 450 : 1050);
    return () => window.clearTimeout(timer);
  }, [frames.length, momentOutcome, momentProgress, momentState.outcome, phase, pivotalTick, reducedMotion, save, tick]);

  useEffect(() => {
    if (phase !== 'full-time' || completed.current || !momentOutcome) return;
    completed.current = true;
    const timer = window.setTimeout(() => onComplete(completeMatch(simulateMatch(campaign.seed, tactics), momentOutcome, tactics, campaign.seed, momentProgress)), reducedMotion ? 450 : 1000);
    return () => window.clearTimeout(timer);
  }, [campaign.seed, momentOutcome, momentProgress, onComplete, phase, reducedMotion, tactics]);

  const pass = useCallback((target: PlayerId) => {
    if (inputLocked || phase !== 'pivotal' || momentState.outcome || target === momentState.ballCarrier) return;
    const next: MomentProgress = { tick: momentProgress.tick, events: [...momentProgress.events, { tick: momentProgress.tick, action: { type: 'pass', target } }] };
    const open = momentState.availablePasses.includes(target);
    const progressed = open ? { ...next, tick: next.tick + 1 } : next;
    setMomentProgress(progressed);
    if (open) setInputLocked(true);
    save(tick, 'pivotal', progressed, null);
  }, [inputLocked, momentProgress, momentState.availablePasses, momentState.ballCarrier, momentState.outcome, phase, save, tick]);

  const shoot = useCallback((zone: ShotZone) => {
    if (inputLocked || phase !== 'pivotal' || momentState.outcome || !momentState.shotAvailable) return;
    const next: MomentProgress = { tick: momentProgress.tick, events: [...momentProgress.events, { tick: momentProgress.tick, action: { type: 'shoot', zone } }] };
    setMomentProgress(next);
    save(tick, 'pivotal', next, null);
  }, [inputLocked, momentProgress, momentState.outcome, momentState.shotAvailable, phase, save, tick]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phase !== 'pivotal' || inputLocked || momentState.outcome) return;
      const player = ({ '1': 'lw', '2': 'ten', '3': 'rw', '4': 'st' } as Record<string, PlayerId>)[event.key];
      const zone = ({ q: 'left', w: 'center', e: 'right' } as Record<string, ShotZone>)[event.key.toLowerCase()];
      if (player && player !== momentState.ballCarrier) { event.preventDefault(); pass(player); }
      if (zone && momentState.shotAvailable) { event.preventDefault(); shoot(zone); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inputLocked, momentState.ballCarrier, momentState.outcome, momentState.shotAvailable, pass, phase, shoot]);

  const renderPlayers = useMemo<readonly RenderPlayer[]>(() => {
    if (phase !== 'pivotal') return frame.players;
    return frame.players.map((player) => {
      const momentId = MOMENT_IDS[player.id];
      if (momentId) return {
        ...player,
        position: momentState.attackers[momentId],
        active: momentState.ballCarrier === momentId,
        interactive: true,
        disabled: inputLocked || momentState.outcome != null || momentState.ballCarrier === momentId,
        lane: momentState.ballCarrier === momentId ? 'carrier' : momentState.closedPasses.includes(momentId) ? 'closed' : 'open',
        accessibleName: `${PLAYER_NAMES[momentId]}${momentState.closedPasses.includes(momentId) ? ', lane closing' : ', open for a pass'}`,
      };
      const defenderIndex = player.id === 'nga-cb1' ? 0 : player.id === 'nga-dm1' ? 1 : player.id === 'nga-cb2' ? 2 : -1;
      if (defenderIndex >= 0) return { ...player, position: momentState.defenders[defenderIndex] };
      if (player.id === 'nga-gk') return { ...player, position: momentState.keeper };
      return player;
    });
  }, [frame.players, inputLocked, momentState, phase]);

  const recentEvents = useMemo(() => frames.filter((candidate) => candidate.meaningful && candidate.tick <= tick).slice(-3).reverse(), [frames, tick]);
  const onSpeed = (next: MatchSpeed) => { setSpeed(next); save(tick, phase, momentProgress, momentOutcome, next); setPlaying(phase !== 'halftime' && phase !== 'pivotal' && phase !== 'full-time'); };
  const skipQuiet = () => moveTo(nextMeaningfulTick(frames, tick));
  const skipToMoment = () => moveTo(pivotalTick);
  const resumeHalf = () => { const secondHalf = frames.findIndex((candidate) => candidate.minute > 45); setPhase('second-half'); setPlaying(true); save(secondHalf, 'second-half'); setTick(secondHalf); };
  const lastShot = momentState.lastAction?.type === 'shoot' ? momentState.lastAction.zone : 'center';
  const outcomeBall = momentState.outcome === 'goal' ? { x: lastShot === 'left' ? 32 : lastShot === 'right' ? 68 : 50, y: 3 } : momentState.outcome ? momentState.keeper : momentState.ball;
  const pitchBall = phase === 'pivotal' ? outcomeBall : frame.ball;
  const scoreFrame = phase === 'pivotal' && momentState.outcome === 'goal' ? { ...frame, score: { ...frame.score, home: frame.score.home + 1 } } : frame;

  return (
    <main className="ywc-prototype ywc-visible-match" data-screen="match" data-phase={phase} data-tick={safeTick} data-minute={frame.minute} data-speed={speed} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <header className="ywc-match-header">
        <p>YOUR WORLD CUP · SIMULATED MATCH</p>
        <div className="ywc-match-score" aria-live="polite" aria-label={`Argentina ${scoreFrame.score.home}, Nigeria ${scoreFrame.score.away}, ${scoreFrame.minute} minutes`}>
          <span>ARG</span><b>{scoreFrame.score.home}<i>–</i>{scoreFrame.score.away}</b><span>NGA</span>
        </div>
        <time dateTime={`PT${scoreFrame.minute}M`}>{String(scoreFrame.minute).padStart(2, '0')}:00</time>
      </header>

      <section className="ywc-match-stage">
        <div className="ywc-match-context">
          <span>{phase === 'pivotal' ? 'PIVOTAL MOMENT' : eventLabel(frame)}</span>
          <strong>{phase === 'pivotal' ? momentState.message : frame.momentumContext}</strong>
          <i>{frame.possessionTeamId === 'arg' ? 'ARGENTINA POSSESSION' : 'NIGERIA POSSESSION'}</i>
        </div>
        <MatchPitch players={renderPlayers} ball={pitchBall} onPlayer={(id) => pass(MOMENT_IDS[id])} shotZones={{ enabled: phase === 'pivotal' && momentState.shotAvailable && !momentState.outcome, onShoot: shoot }} statusLabel={phase === 'pivotal' ? `Playable attack. ${momentState.message}` : `Condensed match at ${frame.minute} minutes. ${frame.momentumContext}`} />
        {phase === 'pivotal' ? <div className="ywc-pivotal-instruction" role="status"><b>{momentState.outcome ? momentState.message : 'Tap the open runner. Shoot when the goal zones appear.'}</b><span>Keys 1–4 pass · Q / W / E shoot · Pressure {Math.max(0, momentState.limit - momentState.tick)}</span></div> : null}
        {phase === 'halftime' ? <div className="ywc-match-freeze is-halftime" role="status"><span>HALF-TIME</span><b>{frame.score.home}–{frame.score.away}</b><p>{frame.momentumContext}</p><button type="button" onClick={resumeHalf}>Resume second half</button></div> : null}
        {phase === 'full-time' ? <div className="ywc-match-freeze is-full-time" role="status"><span>FULL TIME</span><b>{frame.score.home}–{frame.score.away}</b><p>The final whistle prints the result.</p></div> : null}
        {phase === 'pivotal' && momentState.outcome ? <div className={`ywc-match-freeze is-moment is-${momentState.outcome}`} role="status"><span>{momentState.outcome === 'goal' ? 'GOAL' : momentState.outcome === 'interception' ? 'INTERCEPTED' : 'SAVED'}</span><p>{momentState.message}</p><small>The visible match will resume.</small></div> : null}
      </section>

      <aside className="ywc-match-rail" aria-label="Match events and controls">
        <div className="ywc-event-strip" aria-live="polite">
          {recentEvents.map((event) => <p key={event.tick}><time>{event.minute}′</time><span>{eventLabel(event)}</span><b>{event.momentumContext}</b></p>)}
        </div>
        <div className="ywc-match-controls" aria-label="Condensed match controls">
          <button type="button" aria-label={playing ? 'Pause match' : 'Play match'} aria-pressed={playing} onClick={() => { const next = !playing; setPlaying(next); save(safeTick, phase); }}>{playing ? 'PAUSE' : 'PLAY'}</button>
          <div className="ywc-speed-control" role="group" aria-label="Playback speed"><button type="button" className={speed === 1 ? 'is-selected' : ''} aria-pressed={speed === 1} onClick={() => onSpeed(1)}>1×</button><button type="button" className={speed === 2 ? 'is-selected' : ''} aria-pressed={speed === 2} onClick={() => onSpeed(2)}>2×</button><button type="button" className={speed === 4 ? 'is-selected' : ''} aria-pressed={speed === 4} onClick={() => onSpeed(4)}>4×</button></div>
          <button type="button" disabled={phase === 'pivotal' || safeTick >= frames.length - 1} onClick={skipQuiet}>Next event</button>
          <button type="button" disabled={safeTick >= pivotalTick} onClick={skipToMoment}>{safeTick < pivotalTick ? 'Skip to the moment' : 'Moment reached'}</button>
          {safeTick === 0 ? <button type="button" className="ywc-back-clipboard" onClick={onBack}>Back to clipboard</button> : null}
        </div>
      </aside>
    </main>
  );
}
