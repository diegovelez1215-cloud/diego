import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampaignStateV2, CompletedMatch, MatchCheckpoint, MatchPhase, MatchPresentationStep, MatchSpeed, MomentProgress, PersistedVarState, PlayerId, ShotZone } from '../campaign/contracts';
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
  if (tick < pivotalTick && frames[tick]?.minute <= 45) return 'first-half';
  if (tick < pivotalTick) return 'second-half';
  if (tick === pivotalTick) return 'pivotal';
  if (action?.type === 'phase' && action.phase === 'full-time') return 'full-time';
  if (tick >= frames.length - 1) return 'full-time';
  return tick > pivotalTick ? 'closing' : 'first-half';
}

function eventLabel(frame: MatchFrame) {
  if (!frame.action) return 'Open play';
  if (frame.action.type === 'pass') return frame.action.variant?.replaceAll('-', ' ') ?? 'pass';
  if (frame.action.type === 'phase') return (frame.action.phase ?? 'phase').replaceAll('-', ' ');
  return frame.action.type.replaceAll('-', ' ');
}

function clock(frame: MatchFrame) {
  return `${String(frame.minute).padStart(2, '0')}:${String(Math.min(59, frame.second)).padStart(2, '0')}`;
}

function varStateForFrame(frame: MatchFrame): PersistedVarState {
  if (frame.action?.type === 'var-check') return frame.eventProgress < .55 ? 'checking' : 'reviewing';
  if (frame.action?.type === 'var-decision') return frame.action.decision === 'overturned' || frame.action.decision === 'no-penalty' || frame.action.decision === 'no-red' ? 'overturned' : 'confirmed';
  return null;
}

function checkpoint(tick: number, speed: MatchSpeed, phase: MatchPhase, moment: MomentProgress, momentOutcome: MatchCheckpoint['momentOutcome'], presentationStep: MatchPresentationStep, varState: PersistedVarState): MatchCheckpoint {
  return { planVersion: 1, fixtureId: 'arg-nga', tick, speed, phase, moment, momentOutcome, presentationStep, varState };
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
  const [presentationStep, setPresentationStep] = useState<MatchPresentationStep>(campaign.match.phase === 'pivotal' && campaign.match.presentationStep === 'simulation' ? 'control-intro' : campaign.match.presentationStep);
  const [varState, setVarState] = useState<PersistedVarState>(campaign.match.varState);
  const [inputLocked, setInputLocked] = useState(false);
  const completed = useRef(false);
  const input = useMemo(() => ({ fixtureId: campaign.match.fixtureId, campaignSeed: campaign.seed, home: campaignFixture.home, away: campaignFixture.away, tactics }), [campaign.match.fixtureId, campaign.seed, tactics]);
  const plan = useMemo(() => injectPivotalOutcome(createMatchPlan(input), input, momentOutcome), [input, momentOutcome]);
  const frames = useMemo(() => buildPresentationFrames(plan, input), [input, plan]);
  const pivotalTick = useMemo(() => Math.max(0, frames.findIndex((candidate) => candidate.action?.type === 'pivotal-entry')), [frames]);
  const safeTick = Math.min(tick, frames.length - 1);
  const frame = frames[safeTick];
  const momentState = useMemo(() => replayMoment(campaign.seed, tactics, momentProgress), [campaign.seed, momentProgress, tactics]);
  const closingResumeTick = useMemo(() => {
    const pivotalEventIndex = frames[pivotalTick]?.eventIndex ?? -1;
    const resolutionType = momentOutcome === 'goal' ? 'goal' : momentOutcome === 'save' ? 'save' : momentOutcome === 'interception' ? 'interception' : 'defensive-recovery';
    const resolution = frames.find((candidate) => candidate.eventIndex > pivotalEventIndex && candidate.action?.type === resolutionType && candidate.eventProgress === 1);
    return resolution?.tick ?? Math.min(frames.length - 1, pivotalTick + 1);
  }, [frames, momentOutcome, pivotalTick]);

  const save = useCallback((nextTick: number, nextPhase = phase, nextMoment = momentProgress, nextOutcome = momentOutcome, nextSpeed = speed, nextStep = presentationStep, nextVar = varState) => {
    onCheckpoint(checkpoint(nextTick, nextSpeed, nextPhase, nextMoment, nextOutcome, nextStep, nextVar));
  }, [momentOutcome, momentProgress, onCheckpoint, phase, presentationStep, speed, varState]);

  const moveTo = useCallback((nextTick: number) => {
    const bounded = Math.min(frames.length - 1, Math.max(0, nextTick));
    const nextPhase = phaseForTick(bounded, frames, pivotalTick);
    const nextVar = varStateForFrame(frames[bounded]);
    const nextStep: MatchPresentationStep = nextPhase === 'pivotal' ? 'control-intro' : 'simulation';
    setTick(bounded);
    setPhase(nextPhase);
    setVarState(nextVar);
    if (nextPhase === 'pivotal') setPresentationStep(nextStep);
    if (nextPhase === 'halftime' || nextPhase === 'pivotal' || nextPhase === 'full-time') setPlaying(false);
    save(bounded, nextPhase, momentProgress, momentOutcome, speed, nextStep, nextVar);
  }, [frames, momentOutcome, momentProgress, pivotalTick, save, speed]);

  useEffect(() => {
    const varRunning = frame.action?.type === 'var-check' || frame.action?.type === 'var-decision';
    if ((!playing && !varRunning) || phase === 'pivotal' || safeTick >= frames.length - 1) return;
    let animationFrame = 0;
    const base = frame.action?.type === 'var-check' || frame.action?.type === 'var-decision' ? 430 : frame.action?.type === 'shot' ? 310 : 285;
    const timer = window.setTimeout(() => {
      animationFrame = window.requestAnimationFrame(() => moveTo(safeTick + 1));
    }, (reducedMotion ? Math.min(170, base) : base) / speed);
    return () => { window.clearTimeout(timer); window.cancelAnimationFrame(animationFrame); };
  }, [frame.action?.type, frames.length, moveTo, phase, playing, reducedMotion, safeTick, speed]);

  useEffect(() => {
    if (phase !== 'pivotal' || presentationStep !== 'control-intro') return;
    const timer = window.setTimeout(() => {
      setPresentationStep('control-active');
      save(tick, 'pivotal', momentProgress, momentOutcome, speed, 'control-active', null);
    }, reducedMotion ? 220 : 780);
    return () => window.clearTimeout(timer);
  }, [momentOutcome, momentProgress, phase, presentationStep, reducedMotion, save, speed, tick]);

  useEffect(() => {
    if (phase !== 'pivotal' || presentationStep !== 'control-active' || momentState.outcome) return;
    const timer = window.setTimeout(() => {
      const next = { ...momentProgress, tick: Math.min(momentState.limit, momentProgress.tick + 1) };
      setMomentProgress(next);
      save(tick, 'pivotal', next, null, speed, 'control-active', null);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [momentProgress, momentState.limit, momentState.outcome, phase, presentationStep, save, speed, tick]);

  useEffect(() => {
    if (!inputLocked) return;
    const timer = window.setTimeout(() => setInputLocked(false), reducedMotion ? 80 : 320);
    return () => window.clearTimeout(timer);
  }, [inputLocked, reducedMotion]);

  useEffect(() => {
    if (phase !== 'pivotal' || (!momentState.outcome && !momentOutcome)) return;
    const outcome = momentOutcome ?? momentState.outcome!;
    if (!momentOutcome) {
      setMomentOutcome(outcome);
      save(tick, 'pivotal', momentProgress, outcome, speed, 'control-active', null);
      return;
    }
    if (presentationStep === 'control-active') {
      const timer = window.setTimeout(() => {
        setPresentationStep('control-outcome');
        save(tick, 'pivotal', momentProgress, outcome, speed, 'control-outcome', null);
      }, reducedMotion ? 0 : 360);
      return () => window.clearTimeout(timer);
    }
    if (presentationStep === 'control-outcome') {
      const timer = window.setTimeout(() => {
        setPresentationStep('control-returning');
        save(tick, 'pivotal', momentProgress, outcome, speed, 'control-returning', null);
      }, reducedMotion ? 420 : 1050);
      return () => window.clearTimeout(timer);
    }
    if (presentationStep === 'control-returning') {
      const timer = window.setTimeout(() => {
        setTick(closingResumeTick);
        setPhase('closing');
        setPresentationStep('simulation');
        setPlaying(true);
        save(closingResumeTick, 'closing', momentProgress, outcome, speed, 'simulation', null);
      }, reducedMotion ? 360 : 720);
      return () => window.clearTimeout(timer);
    }
  }, [closingResumeTick, momentOutcome, momentProgress, momentState.outcome, phase, presentationStep, reducedMotion, save, speed, tick]);

  useEffect(() => {
    if (phase !== 'full-time' || completed.current || !momentOutcome) return;
    completed.current = true;
    const timer = window.setTimeout(() => onComplete(completeMatch(simulateMatch(campaign.seed, tactics), momentOutcome, tactics, campaign.seed, momentProgress)), reducedMotion ? 450 : 1000);
    return () => window.clearTimeout(timer);
  }, [campaign.seed, momentOutcome, momentProgress, onComplete, phase, reducedMotion, tactics]);

  const pass = useCallback((target: PlayerId) => {
    if (inputLocked || phase !== 'pivotal' || presentationStep !== 'control-active' || momentState.outcome || target === momentState.ballCarrier) return;
    const next: MomentProgress = { tick: momentProgress.tick, events: [...momentProgress.events, { tick: momentProgress.tick, action: { type: 'pass', target } }] };
    const open = momentState.availablePasses.includes(target);
    const progressed = open ? { ...next, tick: next.tick + 1 } : next;
    setMomentProgress(progressed);
    if (open) setInputLocked(true);
    save(tick, 'pivotal', progressed, null, speed, 'control-active', null);
  }, [inputLocked, momentProgress, momentState.availablePasses, momentState.ballCarrier, momentState.outcome, phase, presentationStep, save, speed, tick]);

  const shoot = useCallback((zone: ShotZone) => {
    if (inputLocked || phase !== 'pivotal' || presentationStep !== 'control-active' || momentState.outcome || !momentState.shotAvailable) return;
    const next: MomentProgress = { tick: momentProgress.tick, events: [...momentProgress.events, { tick: momentProgress.tick, action: { type: 'shoot', zone } }] };
    setMomentProgress(next);
    save(tick, 'pivotal', next, null, speed, 'control-active', null);
  }, [inputLocked, momentProgress, momentState.outcome, momentState.shotAvailable, phase, presentationStep, save, speed, tick]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phase !== 'pivotal' || presentationStep !== 'control-active' || inputLocked || momentState.outcome) return;
      const player = ({ '1': 'lw', '2': 'ten', '3': 'rw', '4': 'st' } as Record<string, PlayerId>)[event.key];
      const zone = ({ q: 'left', w: 'center', e: 'right' } as Record<string, ShotZone>)[event.key.toLowerCase()];
      if (player && player !== momentState.ballCarrier) { event.preventDefault(); pass(player); }
      if (zone && momentState.shotAvailable) { event.preventDefault(); shoot(zone); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inputLocked, momentState.ballCarrier, momentState.outcome, momentState.shotAvailable, pass, phase, presentationStep, shoot]);

  const renderPlayers = useMemo<readonly RenderPlayer[]>(() => {
    if (phase !== 'pivotal') return frame.players;
    return frame.players.map((player) => {
      const momentId = MOMENT_IDS[player.id];
      if (momentId) return {
        ...player,
        position: momentState.attackers[momentId],
        active: momentState.ballCarrier === momentId,
        interactive: true,
        disabled: presentationStep !== 'control-active' || inputLocked || momentState.outcome != null || momentState.ballCarrier === momentId,
        lane: momentState.ballCarrier === momentId ? 'carrier' : momentState.closedPasses.includes(momentId) ? 'closed' : 'open',
        accessibleName: `${PLAYER_NAMES[momentId]}${momentState.closedPasses.includes(momentId) ? ', closed lane because a defender is in the passing path' : ', open for a pass'}`,
      };
      const defenderIndex = player.id === 'nga-cb1' ? 0 : player.id === 'nga-dm1' ? 1 : player.id === 'nga-cb2' ? 2 : -1;
      if (defenderIndex >= 0) return { ...player, position: momentState.defenders[defenderIndex], supporting: true };
      if (player.id === 'nga-gk') return { ...player, position: momentState.keeper, supporting: true };
      if (player.role === 'goalkeeper') return player;
      return { ...player, supporting: true };
    });
  }, [frame.players, inputLocked, momentState, phase, presentationStep]);

  const recentEvents = useMemo(() => frames.filter((candidate) => candidate.meaningful && candidate.tick <= tick).slice(-4).reverse(), [frames, tick]);
  const onSpeed = (next: MatchSpeed) => { setSpeed(next); save(tick, phase, momentProgress, momentOutcome, next, presentationStep, varState); setPlaying(phase !== 'halftime' && phase !== 'pivotal' && phase !== 'full-time'); };
  const skipQuiet = () => moveTo(nextMeaningfulTick(frames, tick));
  const skipToMoment = () => { if (!varState) moveTo(pivotalTick); };
  const resumeHalf = () => {
    const secondHalf = frames.findIndex((candidate) => candidate.minute > 45);
    setPhase('second-half'); setPlaying(true); setPresentationStep('simulation'); setVarState(null); setTick(secondHalf);
    save(secondHalf, 'second-half', momentProgress, momentOutcome, speed, 'simulation', null);
  };
  const lastShot = momentState.lastAction?.type === 'shoot' ? momentState.lastAction.zone : 'center';
  const outcomeBall = momentState.outcome === 'goal' ? { x: lastShot === 'left' ? 42 : lastShot === 'right' ? 58 : 50, y: 2.2 } : momentState.outcome ? momentState.keeper : momentState.ball;
  const pitchBall = phase === 'pivotal' ? outcomeBall : frame.ball;
  const pitchBallState = phase === 'pivotal' ? momentState.outcome === 'goal' ? 'net' : momentState.outcome ? 'keeper' : 'owned' : frame.ballState;
  const scoreFrame = phase === 'pivotal' && momentOutcome === 'goal' && (presentationStep === 'control-outcome' || presentationStep === 'control-returning') ? { ...frame, score: { ...frame.score, home: frame.score.home + 1 } } : frame;
  const unresolvedVar = varState === 'checking' || varState === 'reviewing';
  const controlClock = `${String(frame.minute).padStart(2, '0')}:14`;

  return (
    <main className="ywc-prototype ywc-visible-match" data-screen="match" data-phase={phase} data-presentation-step={presentationStep} data-var-state={varState ?? ''} data-tick={safeTick} data-minute={frame.minute} data-second={frame.second} data-event-index={frame.eventIndex} data-event-progress={frame.eventProgress.toFixed(3)} data-action={frame.action?.type ?? 'open-play'} data-action-variant={frame.action?.variant ?? frame.action?.outcome ?? ''} data-possession={frame.possessionTeamId} data-ball-owner={frame.ballOwnerId ?? ''} data-score={`${scoreFrame.score.home}-${scoreFrame.score.away}`} data-moment-tick={momentState.tick} data-moment-outcome={momentState.outcome ?? ''} data-moment-resolved={presentationStep === 'control-outcome' || presentationStep === 'control-returning' ? 'true' : 'false'} data-speed={speed} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <header className="ywc-match-header">
        <p>YOUR WORLD CUP · SIMULATED MATCH</p>
        <div className="ywc-match-score" aria-live="polite" aria-label={`Argentina ${scoreFrame.score.home}, Nigeria ${scoreFrame.score.away}, ${clock(scoreFrame)}`}>
          <span>ARG</span><b>{scoreFrame.score.home}<i>–</i>{scoreFrame.score.away}</b><span>NGA</span>
        </div>
        <time dateTime={`PT${scoreFrame.minute}M${scoreFrame.second}S`}>{clock(scoreFrame)}</time>
      </header>

      <section className={`ywc-match-stage${phase === 'pivotal' ? ' is-pivotal' : ''}`}>
        <div className="ywc-match-context">
          <span>{phase === 'pivotal' ? 'TAKE CONTROL' : eventLabel(frame)}</span>
          <strong>{phase === 'pivotal' ? momentState.message : frame.momentumContext}</strong>
          <i>{frame.possessionTeamId === 'arg' ? 'ARGENTINA POSSESSION' : 'NIGERIA POSSESSION'}</i>
        </div>
        <MatchPitch players={renderPlayers} ball={pitchBall} ballHeight={phase === 'pivotal' ? 0 : frame.ballHeight} ballRotation={frame.ballRotation} ballState={pitchBallState} onPlayer={(id) => pass(MOMENT_IDS[id])} shotZones={{ enabled: phase === 'pivotal' && presentationStep === 'control-active' && momentState.shotAvailable && !momentState.outcome && !inputLocked, onShoot: shoot }} controlReady={phase === 'pivotal' && presentationStep === 'control-active'} statusLabel={phase === 'pivotal' ? `Control transferred at ${controlClock}. ${momentState.message}` : `Condensed match at ${clock(frame)}. ${frame.momentumContext}`} />

        {phase === 'pivotal' && presentationStep === 'control-intro' ? <div className="ywc-control-transfer" role="alert" aria-live="assertive"><strong>TAKE CONTROL</strong><b>{controlClock} · ARGENTINA ATTACK</b><p>Create the chance. Tap an open teammate.</p><span>Simulation slowed · clock paused · controls preparing</span></div> : null}
        {phase === 'pivotal' && presentationStep === 'control-active' ? <div className="ywc-pivotal-instruction" role="status"><b>{momentState.outcome ? momentState.message : 'Create the chance. Tap an open teammate.'}</b><span>Solid lane = open · crossed lane = closed<br />Keys 1–4 pass · Q / W / E shoot · Pressure {Math.max(0, momentState.limit - momentState.tick)}</span></div> : null}
        {phase === 'halftime' ? <div className="ywc-match-freeze is-halftime" role="status"><span>HALF-TIME</span><b>{frame.score.home}–{frame.score.away}</b><p>{frame.momentumContext}</p><button type="button" onClick={resumeHalf}>Resume second half</button></div> : null}
        {phase === 'full-time' ? <div className="ywc-match-freeze is-full-time" role="status"><span>FULL TIME</span><b>{frame.score.home}–{frame.score.away}</b><p>The final whistle locks the event ledger and result.</p></div> : null}
        {frame.action?.type === 'var-check' || frame.action?.type === 'var-decision' ? <div className={`ywc-var-overlay is-${varState ?? 'decision'}`} role="alert" aria-live="assertive"><span>{frame.action.type === 'var-check' ? 'VAR CHECK' : 'VAR DECISION'}</span><b>{(frame.action.review ?? 'incident').replaceAll('-', ' ')}</b><p>{frame.action.type === 'var-check' ? 'Clock paused. The score is held while the incident is reviewed.' : `Decision: ${(frame.action.decision ?? 'confirmed').replaceAll('-', ' ')}. The ledger and restart have been updated.`}</p></div> : null}
        {phase === 'pivotal' && presentationStep === 'control-outcome' ? <div className={`ywc-match-freeze is-moment is-${momentState.outcome}`} role="status"><span>{momentState.outcome === 'goal' ? 'GOAL' : momentState.outcome === 'interception' ? 'INTERCEPTED' : momentState.outcome === 'expired' ? 'TIME' : 'SAVED'}</span><p>{momentState.message}</p><small>Outcome held before the match resumes.</small></div> : null}
        {phase === 'pivotal' && presentationStep === 'control-returning' ? <div className="ywc-returning-overlay" role="status"><strong>RETURNING TO MATCH</strong><p>The deterministic ledger resumes from this exact outcome.</p></div> : null}
      </section>

      <aside className="ywc-match-rail" aria-label="Match events and controls">
        <div className="ywc-event-strip" aria-live="polite">
          {recentEvents.map((event) => <p key={event.tick}><time>{event.minute}′</time><span>{eventLabel(event)}</span><b>{event.momentumContext}</b></p>)}
        </div>
        <div className="ywc-match-controls" aria-label="Condensed match controls">
          <button type="button" aria-label={playing ? 'Pause match' : 'Play match'} aria-pressed={playing} disabled={phase === 'pivotal' || unresolvedVar} onClick={() => { const next = !playing; setPlaying(next); save(safeTick, phase); }}>{playing ? 'PAUSE' : 'PLAY'}</button>
          <div className="ywc-speed-control" role="group" aria-label="Playback speed"><button type="button" className={speed === 1 ? 'is-selected' : ''} aria-pressed={speed === 1} disabled={unresolvedVar} onClick={() => onSpeed(1)}>1×</button><button type="button" className={speed === 2 ? 'is-selected' : ''} aria-pressed={speed === 2} disabled={unresolvedVar} onClick={() => onSpeed(2)}>2×</button><button type="button" className={speed === 4 ? 'is-selected' : ''} aria-pressed={speed === 4} disabled={unresolvedVar} onClick={() => onSpeed(4)}>4×</button></div>
          <button type="button" disabled={phase === 'pivotal' || unresolvedVar || safeTick >= frames.length - 1} onClick={skipQuiet}>Next event</button>
          <button type="button" disabled={unresolvedVar || safeTick >= pivotalTick} onClick={skipToMoment}>{safeTick < pivotalTick ? 'Take control / Skip to the moment' : 'Control reached'}</button>
          {safeTick === 0 ? <button type="button" className="ywc-back-clipboard" onClick={onBack}>Back to clipboard</button> : null}
        </div>
      </aside>
    </main>
  );
}
