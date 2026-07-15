import { useEffect, useMemo, useState } from 'react';
import { PROTOTYPE_STORAGE_KEY, readPrototypeState, writePrototypeState, type PrototypeScreen } from './prototype-state';
import { createCampaign, readCampaign, recordMatch, resetCampaign, writeCampaign } from './campaign/campaign-store';
import { DEFAULT_TACTICS, type CampaignStateV1, type MomentProgress, type PlayerId, type ShotZone, type Tactics } from './campaign/contracts';
import { replayMoment } from './campaign/moment-engine';
import { completeMatch, groupTable, otherGroupResult, simulateMatch } from './campaign/simulation';
import './your-world-cup.css';

type View = 'opening' | PrototypeScreen;

const nations = [
  { name: 'Argentina', code: 'ARG', flag: 'argentina', style: 'Quick combinations', available: true },
  { name: 'Nigeria', code: 'NGA', flag: 'nigeria', style: 'Fast transitions', available: false },
  { name: 'Poland', code: 'POL', flag: 'poland', style: 'Set-piece steel', available: false },
  { name: 'New Zealand', code: 'NZL', flag: 'new-zealand', style: 'Relentless running', available: false },
  { name: 'Japan', code: 'JPN', flag: 'japan', style: 'One-touch rhythm', available: false },
  { name: 'Mexico', code: 'MEX', flag: 'mexico', style: 'Front-foot pressure', available: false },
] as const;

const group = [
  { name: 'Argentina', code: 'ARG', flag: 'argentina' },
  { name: 'Nigeria', code: 'NGA', flag: 'nigeria' },
  { name: 'Poland', code: 'POL', flag: 'poland' },
  { name: 'New Zealand', code: 'NZL', flag: 'new-zealand' },
] as const;

function Flag({ name }: { name: string }) {
  return <span className={`ywc-flag ywc-flag--${name}`} aria-hidden="true" />;
}

function FootballPosterBall() {
  return (
    <svg className="ywc-poster-ball" viewBox="0 0 360 360" aria-hidden="true">
      <circle cx="180" cy="180" r="164" fill="#f7f0df" stroke="currentColor" strokeWidth="9" />
      <path d="m180 91 53 39-20 63h-66l-20-63 53-39Z" fill="currentColor" />
      <path d="m127 130-70-17m176 17 70-17M147 193l-43 62m109-62 43 62M104 255l-2 58m154-58 2 58M127 130 91 62m142 68 36-68" fill="none" stroke="currentColor" strokeWidth="9" strokeLinejoin="round" />
      <path d="M91 62 45 106l12 7m212-51 46 44-12 7M102 313l78 31 78-31" fill="none" stroke="currentColor" strokeWidth="9" strokeLinejoin="round" />
    </svg>
  );
}

function PrototypeLabel({ compact = false }: { compact?: boolean }) {
  return <p className={`ywc-simulation-label${compact ? ' is-compact' : ''}`}>Simulated personal tournament · Prototype</p>;
}

function OpeningScreen({ hasCampaign, onStart, onContinue }: { hasCampaign: boolean; onStart: () => void; onContinue: () => void }) {
  return (
    <main className="ywc-prototype ywc-opening" data-screen="opening">
      <div className="ywc-print-noise" aria-hidden="true" />
      <div className="ywc-opening__cobalt" aria-hidden="true" />
      <div className="ywc-opening__sun" aria-hidden="true" />
      <div className="ywc-opening__ball-wrap"><FootballPosterBall /></div>
      <div className="ywc-opening__edition" aria-hidden="true">SUMMER 26<br />POSTER 001</div>
      <section className="ywc-opening__copy" aria-labelledby="ywc-opening-title">
        <PrototypeLabel />
        <h1 id="ywc-opening-title"><span>Your</span><span>World Cup</span></h1>
        <p className="ywc-marker-line">The tournament of your life. The whole street is watching.</p>
        <div className="ywc-opening__stickers" aria-hidden="true">
          <span>Pick the shirt</span><span>Survive the draw</span><span>Write the story</span>
        </div>
      </section>
      <div className="ywc-opening__actions">
        <button type="button" className="ywc-button ywc-button--primary" onClick={onStart}>Start your World Cup <span aria-hidden="true">→</span></button>
        {hasCampaign ? <button type="button" className="ywc-button ywc-button--paper" onClick={onContinue}>Continue campaign <span aria-hidden="true">↗</span></button> : null}
      </div>
      <div className="ywc-opening__terrace"><span>48 NATIONS · 3 HOST COUNTRIES · YOUR COLORS · YOUR NOISE · YOUR WORLD CUP</span></div>
    </main>
  );
}

function NationScreen({ selected, onSelect, onChoose, onBack }: { selected: boolean; onSelect: () => void; onChoose: () => void; onBack: () => void }) {
  return (
    <main className="ywc-prototype ywc-nations" data-screen="nation">
      <div className="ywc-print-noise" aria-hidden="true" />
      <header className="ywc-screen-head">
        <button type="button" className="ywc-back" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
        <PrototypeLabel compact />
      </header>
      <section className="ywc-nations__intro">
        <p className="ywc-kicker">Sticker sheet no. 10</p>
        <h1>Pick your <em>colors</em></h1>
        <p>One shirt. One summer. Peel the nation you want to carry.</p>
      </section>
      <section className="ywc-sticker-sheet" aria-label="Choose a nation">
        <div className="ywc-tape ywc-tape--one" aria-hidden="true" />
        <div className="ywc-tape ywc-tape--two" aria-hidden="true" />
        <p className="ywc-sheet-note">Fictional prototype play styles</p>
        <div className="ywc-sticker-grid">
          {nations.map((nation, index) => {
            const chosen = nation.name === 'Argentina' && selected;
            return (
              <button
                type="button"
                className={`ywc-nation-sticker${chosen ? ' is-selected' : ''}`}
                key={nation.code}
                disabled={!nation.available}
                onClick={nation.available ? onSelect : undefined}
                aria-pressed={nation.available ? chosen : undefined}
                aria-label={`${nation.name}, ${nation.style}${nation.available ? ', available to choose' : ', not in prototype'}`}
                style={{ '--sticker-turn': `${[-4, 3, -2, 4, -3, 2][index]}deg` } as React.CSSProperties}
              >
                <span className="ywc-sticker-disc"><Flag name={nation.flag} /></span>
                <strong>{nation.name}</strong>
                <span>{nation.style}</span>
                {chosen ? <b className="ywc-peeled">Peeled!</b> : null}
              </button>
            );
          })}
        </div>
        <div className="ywc-screen-actions ywc-screen-actions--nation">
          <p className="ywc-marker-note">{selected ? 'that sky-blue shirt is yours →' : 'tap Argentina to peel the sticker'}</p>
          <button type="button" className="ywc-button ywc-button--pink" disabled={!selected} onClick={onChoose}>Choose Argentina <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </main>
  );
}

function DrawScreen({ reducedMotion, onComplete, onBack }: { reducedMotion: boolean; onComplete: () => void; onBack: () => void }) {
  const [complete, setComplete] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setComplete(true);
      return;
    }
    const timer = window.setTimeout(() => setComplete(true), 2700);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <main className={`ywc-prototype ywc-draw ${complete ? 'is-complete' : 'is-running'}`} data-screen="draw" data-draw-complete={complete ? 'true' : 'false'}>
      <div className="ywc-print-noise" aria-hidden="true" />
      <header className="ywc-screen-head ywc-screen-head--dark">
        <button type="button" className="ywc-back ywc-back--dark" onClick={onBack}><span aria-hidden="true">←</span> Stickers</button>
        {!complete ? <button type="button" className="ywc-skip" onClick={() => setComplete(true)}>Skip draw</button> : <PrototypeLabel compact />}
      </header>
      <div className="ywc-flood-flash" aria-hidden="true" />
      <section className="ywc-draw__stage" aria-labelledby="ywc-draw-title" aria-live="polite">
        <div className="ywc-draw-scraps" aria-hidden="true">
          <span>POT 1 · ARG</span>
          <span>DRAW CARD 26</span>
          <span>C</span>
        </div>
        <article className="ywc-draw-poster">
          <div className="ywc-tape ywc-tape--draw" aria-hidden="true" />
          <p>United 26 · Personal draw</p>
          <h1 id="ywc-draw-title">Group <strong>C</strong></h1>
          <div className="ywc-draw-grid">
            {group.map((team, index) => (
              <div className="ywc-draw-sticker" key={team.code} style={{ '--draw-order': index } as React.CSSProperties}>
                <Flag name={team.flag} />
                <span>{team.name}</span>
                <b>{team.code}</b>
              </div>
            ))}
          </div>
          <p className="ywc-draw-marker">WE START WITH NIGERIA. BRING THE NOISE.</p>
          <div className="ywc-draw-scorebug" aria-hidden="true"><span>DRAW COMPLETE</span><b>GROUP C</b></div>
        </article>
        <div className="ywc-draw-footer">
          <p className="ywc-draw-status">{complete ? 'Group C is on the wall.' : 'Your group is being printed…'}</p>
          {complete ? <button type="button" className="ywc-button ywc-button--marigold" onClick={onComplete}>Enter campaign <span aria-hidden="true">→</span></button> : null}
        </div>
      </section>
    </main>
  );
}

function GroupTable({ campaign }: { campaign: CampaignStateV1 | null }) {
  const match = campaign?.completedMatches[0];
  const table = groupTable(match, campaign?.seed ?? 26062026);
  return (
    <div className="ywc-group-table">
      <div className="ywc-tape ywc-tape--table" aria-hidden="true" />
      <div className="ywc-artifact-title"><span>Group C</span><b>{match ? 'Simulated campaign' : 'Before kickoff'}</b></div>
      <div className="ywc-table-head"><span>Nation</span><span>PL</span><span>GD</span><span>PTS</span></div>
      {table.map((team) => (
        <div className={`ywc-table-row${team.name === 'Argentina' ? ' is-you' : ''}`} key={team.name}>
          <span><Flag name={team.name === 'New Zealand' ? 'new-zealand' : team.name.toLowerCase()} />{team.name}</span><b>{team.played}</b><b>{team.gd}</b><b>{team.points}</b>
        </div>
      ))}
      <p className="ywc-table-scrawl">{match ? `Poland ${otherGroupResult(campaign!.seed).home}–${otherGroupResult(campaign!.seed).away} New Zealand` : 'top two keep the dream alive'}</p>
    </div>
  );
}

function CampaignScreen({ campaign, onPlay, onReset }: { campaign: CampaignStateV1 | null; onPlay: () => void; onReset: () => void }) {
  const match = campaign?.completedMatches[0];
  return (
    <main className="ywc-prototype ywc-campaign" data-screen="campaign">
      <div className="ywc-print-noise" aria-hidden="true" />
      <header className="ywc-campaign__header">
        <PrototypeLabel compact />
        <p>Argentina · Campaign 001</p>
        <h1>The campaign wall</h1>
        <span className="ywc-campaign-stamp">THE DREAM STARTS HERE</span>
      </header>
      <section className="ywc-wall" aria-label="Argentina campaign artifacts">
        <div className="ywc-wall__table"><GroupTable campaign={campaign} /></div>
        <article className="ywc-next-ticket">
          <div className="ywc-ticket-stub" aria-hidden="true">C26<br />001</div>
          <p>{match ? 'Next fixture · Group C' : 'Matchday 1 · Group C'}</p>
          <h2><span><Flag name="argentina" /> Argentina</span><i>v</i><span><Flag name={match ? 'poland' : 'nigeria'} /> {match ? 'Poland' : 'Nigeria'}</span></h2>
          <dl><div><dt>{match ? 'Last result' : 'When'}</dt><dd>{match ? `Argentina ${match.homeGoals}–${match.awayGoals} Nigeria` : 'Friday · 20:00'}</dd></div><div><dt>{match ? 'Points' : 'Where'}</dt><dd>{match ? `${groupTable(match, campaign!.seed).find((team) => team.name === 'Argentina')!.points} after one` : 'Atlanta · Gate C'}</dd></div></dl>
          <b className="ywc-ticket-callout">{match ? 'NEXT UP' : 'NEXT MATCH'}</b>
        </article>
        <article className="ywc-road-map">
          <div className="ywc-tape ywc-tape--road" aria-hidden="true" />
          <p>Road to New York / New Jersey</p>
          <div className="ywc-road-line" aria-hidden="true" />
          <ol>
            <li className="is-now"><b>01</b><span>Group C</span><small>Argentina v Nigeria</small></li>
            <li><b>02</b><span>Round of 32</span><small>Earn your place</small></li>
            <li><b>03</b><span>Final</span><small>The empty frame</small></li>
          </ol>
        </article>
        <aside className="ywc-wall-notes" aria-label="Campaign notes">
          <span className="ywc-note ywc-note--pink">the whole block is watching</span>
          <span className="ywc-note ywc-note--gold">3 group matches<br />one way through</span>
          <span className="ywc-scarf" aria-hidden="true">ARGENTINA · ARGENTINA · ARGENTINA</span>
        </aside>
      </section>
      <div className="ywc-campaign__action">
        {match ? <p className="ywc-prototype-message" role="status">A {match.outcome} is pinned to your wall. Poland is next.</p> : <p className="ywc-prototype-message" role="status">YOUR WORLD CUP · SIMULATED CAMPAIGN</p>}
        {match ? <button type="button" className="ywc-button ywc-button--paper" onClick={onReset}>Reset this slice <span aria-hidden="true">↺</span></button> : <button type="button" className="ywc-button ywc-button--pink" onClick={onPlay}>Play Argentina v Nigeria <span aria-hidden="true">→</span></button>}
      </div>
    </main>
  );
}

function TacticsClipboard({ tactics, onChange, onKickOff, onBack }: { tactics: Tactics; onChange: (next: Tactics) => void; onKickOff: () => void; onBack: () => void }) {
  const pressValues = ['patient', 'balanced', 'aggressive'] as const;
  const finalThirdValues = ['wings', 'number-10', 'direct-runners'] as const;
  return <main className="ywc-prototype ywc-tactics" data-screen="tactics">
    <header className="ywc-screen-head"><button type="button" className="ywc-back" onClick={onBack}>← Wall</button><PrototypeLabel compact /></header>
    <section className="ywc-clipboard" aria-labelledby="ywc-tactics-title">
      <div className="ywc-clip" aria-hidden="true" />
      <p className="ywc-kicker">Coach clipboard · fictional campaign</p><h1 id="ywc-tactics-title">Make the <em>plan</em></h1>
      <div className={`ywc-tactics-pitch is-${tactics.shape}`} aria-label={`Pitch diagram for ${tactics.shape}`}>
        {[1, 4, 5, 6, 3, 8, 10, 11, 7, 9].map((number) => <i key={number}>{number}</i>)}
      </div>
      <fieldset className="ywc-choice"><legend>Shape</legend>{(['4-3-3-wide', '4-2-3-1-control'] as const).map((value) => <button type="button" key={value} className={tactics.shape === value ? 'is-selected' : ''} aria-pressed={tactics.shape === value} onClick={() => onChange({ ...tactics, shape: value })}>{value === '4-3-3-wide' ? '4–3–3 Wide' : '4–2–3–1 Control'}</button>)}</fieldset>
      <fieldset className="ywc-choice"><legend>Press</legend>{pressValues.map((value) => <button type="button" key={value} className={tactics.press === value ? 'is-selected' : ''} aria-pressed={tactics.press === value} onClick={() => onChange({ ...tactics, press: value })}>{value}</button>)}</fieldset>
      <fieldset className="ywc-choice"><legend>Final-third plan</legend>{finalThirdValues.map((value) => <button type="button" key={value} className={tactics.finalThird === value ? 'is-selected' : ''} aria-pressed={tactics.finalThird === value} onClick={() => onChange({ ...tactics, finalThird: value })}>{value === 'wings' ? 'Attack the wings' : value === 'number-10' ? 'Play through the 10' : 'Direct runners'}</button>)}</fieldset>
      <p className="ywc-marker-note">Your plan changes the tape and the last attack.</p>
      <button type="button" className="ywc-button ywc-button--pink" onClick={onKickOff}>Kick off <span aria-hidden="true">→</span></button>
    </section>
  </main>;
}

function MatchStory({ campaign, onMoment, onBack }: { campaign: CampaignStateV1; onMoment: () => void; onBack: () => void }) {
  const setup = simulateMatch(campaign.seed, campaign.tactics!);
  const [shown, setShown] = useState(1);
  useEffect(() => { const timer = window.setInterval(() => setShown((count) => Math.min(setup.story.length, count + 1)), 650); const ready = window.setTimeout(onMoment, 3200); return () => { window.clearInterval(timer); window.clearTimeout(ready); }; }, [onMoment, setup.story.length]);
  return <main className="ywc-prototype ywc-match-story" data-screen="match-story">
    <div className="ywc-score-bug"><span>YOUR WORLD CUP · SIMULATED</span><b>ARG {setup.homeGoals}–{setup.awayGoals} NGA</b><i>{setup.minute}′</i></div>
    <section className="ywc-match-tape" aria-live="polite"><p className="ywc-kicker">Fast match tape · your tactics in motion</p><h1>THE TAPE <em>ROLLS</em></h1>{setup.story.slice(0, shown).map((line, index) => <p className="ywc-tape-strip" key={line} style={{ '--turn': `${index % 2 ? 1 : -1}deg` } as React.CSSProperties}>{line}</p>)}<strong>{setup.prompt}</strong></section>
    <div className="ywc-story-actions"><button type="button" className="ywc-back ywc-back--dark" onClick={onBack}>← Clipboard</button><button type="button" className="ywc-button ywc-button--marigold" onClick={onMoment}>Skip to the moment <span aria-hidden="true">→</span></button></div>
  </main>;
}

function LastChanceMoment({ campaign, reducedMotion, onProgress, onComplete }: { campaign: CampaignStateV1; reducedMotion: boolean; onProgress: (progress: MomentProgress) => void; onComplete: (progress: MomentProgress) => void }) {
  const setup = simulateMatch(campaign.seed, campaign.tactics!);
  const state = replayMoment(campaign.seed, campaign.tactics!, campaign.moment);
  useEffect(() => {
    if (state.outcome) { const timer = window.setTimeout(() => onComplete(campaign.moment), reducedMotion ? 0 : 220); return () => window.clearTimeout(timer); }
    const timer = window.setInterval(() => onProgress({ ...campaign.moment, tick: campaign.moment.tick + 1 }), 1000);
    return () => window.clearInterval(timer);
  }, [campaign.moment, onComplete, onProgress, reducedMotion, state.outcome]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.outcome) return;
      const player = ({ '1': 'lw', '2': 'ten', '3': 'rw', '4': 'st' } as Record<string, PlayerId>)[event.key];
      const zone = ({ q: 'left', w: 'center', e: 'right' } as Record<string, ShotZone>)[event.key.toLowerCase()];
      if (player && player !== state.ballCarrier) { event.preventDefault(); onProgress({ ...campaign.moment, events: [...campaign.moment.events, { tick: campaign.moment.tick, action: { type: 'pass', target: player } }] }); }
      if (zone && state.shotAvailable) { event.preventDefault(); onProgress({ ...campaign.moment, events: [...campaign.moment.events, { tick: campaign.moment.tick, action: { type: 'shoot', zone } }] }); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [campaign.moment, onProgress, state.ballCarrier, state.outcome, state.shotAvailable]);
  const pass = (target: PlayerId) => !state.outcome && target !== state.ballCarrier && onProgress({ ...campaign.moment, events: [...campaign.moment.events, { tick: campaign.moment.tick, action: { type: 'pass', target } }] });
  const shoot = (zone: ShotZone) => state.shotAvailable && onProgress({ ...campaign.moment, events: [...campaign.moment.events, { tick: campaign.moment.tick, action: { type: 'shoot', zone } }] });
  const label: Record<PlayerId, string> = { lw: 'Luna', ten: 'Ocampo', rw: 'Garay', st: 'Ferreyra' };
  const percent = (point: { x: number; y: number }) => ({ left: `${point.x}%`, top: `${point.y}%` });
  return <main className="ywc-prototype ywc-moment" data-screen="moment" tabIndex={0}>
    <div className="ywc-score-bug"><span>YOUR WORLD CUP · SIMULATED</span><b>ARG {setup.homeGoals}–{setup.awayGoals} NGA</b><i>{setup.minute}′ + {state.tick}</i></div>
    <section className={`ywc-play-panel${state.outcome ? ` is-${state.outcome}` : ''}`} aria-label="Playable last-chance attack">
      <div className="ywc-goal">{state.shotAvailable ? (['left', 'center', 'right'] as const).map((zone) => <button type="button" key={zone} className={`ywc-goal-zone ywc-goal-zone--${zone}`} onClick={() => shoot(zone)} aria-label={`Shoot ${zone} goal zone`} />) : null}</div>
      <div className={`ywc-keeper${state.outcome === 'save' ? ' is-diving' : ''}`} style={percent(state.keeper)} aria-hidden="true" />
      {(['lw', 'ten', 'rw', 'st'] as const).map((id) => <button type="button" key={id} className={`ywc-player ywc-player--${id}${state.ballCarrier === id ? ' is-active' : ''}${state.closedPasses.includes(id) ? ' is-closed' : ''}`} style={percent(state.attackers[id])} disabled={state.outcome != null || state.ballCarrier === id} onClick={() => pass(id)} aria-label={`${label[id]}${state.closedPasses.includes(id) ? ', lane closing' : ', open for a pass'}`}>{label[id]}<small>{id === 'lw' ? '1' : id === 'ten' ? '2' : id === 'rw' ? '3' : '4'}</small></button>)}
      {state.defenders.map((defender, index) => <i className="ywc-defender" key={index} style={percent(defender)} aria-hidden="true" />)}
      <div className={`ywc-ball${state.lastAction?.type === 'pass' ? ' is-travelling' : ''}`} style={percent(state.ball)} aria-hidden="true">●</div>
      {state.outcome ? <div className="ywc-moment-feedback" role="status">{state.message}</div> : null}
    </section>
    <section className="ywc-moment-controls" aria-label="Attack status"><p className="ywc-marker-note" aria-live="polite">{state.message}</p><p className="ywc-moment-timer">Stoppage time: {Math.max(0, state.limit - state.tick)} · Ball: {label[state.ballCarrier]}</p><p className="ywc-keyboard-note">Tap a teammate. Keys 1–4 pass; when at goal, Q / W / E shoot left, centre, right.</p></section>
  </main>;
}

function FullTimeArtifact({ campaign, onReturn }: { campaign: CampaignStateV1; onReturn: () => void }) {
  const match = campaign.completedMatches[0]!; const positive = match.outcome === 'win';
  return <main className={`ywc-prototype ywc-full-time ${positive ? 'is-positive' : 'is-negative'}`} data-screen="result"><article className="ywc-result-artifact"><p>{positive ? 'THE FINAL WHISTLE · FREE EDITION' : 'THE CAMPAIGN WALL · RAIN EDITION'}</p><h1>{positive ? 'ARGENTINA FIND A WAY' : match.outcome === 'draw' ? 'A POINT TO PIN UP' : 'WE GO AGAIN'}</h1><div className="ywc-result-score">ARG {match.homeGoals}–{match.awayGoals} NGA</div><strong>{positive ? 'THE LAST MOVE BECOMES A FRONT PAGE.' : match.decisiveMoment === 'interception' ? 'Nigeria closed the lane. The story keeps moving.' : 'The last chance did not land. The next one is waiting.'}</strong><small>YOUR WORLD CUP · SIMULATED CAMPAIGN · Argentina have {groupTable(match, campaign.seed).find((team) => team.name === 'Argentina')!.points} point{groupTable(match, campaign.seed).find((team) => team.name === 'Argentina')!.points === 1 ? '' : 's'}.</small></article><button type="button" className="ywc-button ywc-button--paper" onClick={onReturn}>{positive ? 'Keep the paper' : 'Pin it up. We go again.'} <span aria-hidden="true">→</span></button></main>;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function YourWorldCupPrototype() {
  const initialState = useMemo(() => readPrototypeState(window.localStorage), []);
  const initialCampaign = useMemo(() => readCampaign(window.localStorage), []);
  const [savedState, setSavedState] = useState(initialState);
  const [campaign, setCampaign] = useState<CampaignStateV1 | null>(initialCampaign);
  const [view, setView] = useState<View>(() => initialCampaign && initialCampaign.stage !== 'campaign' ? 'campaign' : 'opening');
  const [selected, setSelected] = useState(false);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  useEffect(() => {
    document.title = 'Your World Cup — United 26 Prototype';
  }, []);

  function persist(screen: PrototypeScreen, nation: 'Argentina' | null) {
    const next = { version: 1, screen, nation } as const;
    writePrototypeState(window.localStorage, next);
    setSavedState(next);
  }

  function saveCampaign(next: CampaignStateV1) {
    writeCampaign(window.localStorage, next);
    setCampaign(next);
  }

  function openTactics() {
    const next = campaign ?? createCampaign();
    saveCampaign({ ...next, stage: 'tactics', tactics: next.tactics ?? DEFAULT_TACTICS, moment: { tick: 0, events: [] } });
  }

  function setTactics(tactics: Tactics) {
    const current = campaign ?? createCampaign();
    saveCampaign({ ...current, stage: 'tactics', tactics });
  }

  function kickOff() {
    if (!campaign?.tactics) return;
    saveCampaign({ ...campaign, stage: 'match-story', moment: { tick: 0, events: [] } });
  }

  function startMoment() {
    if (!campaign?.tactics) return;
    saveCampaign({ ...campaign, stage: 'moment', moment: { tick: 0, events: [] } });
  }

  function updateMoment(progress: MomentProgress) {
    if (campaign?.stage === 'moment' && !campaign.completedMatches.length) saveCampaign({ ...campaign, moment: progress });
  }

  function resolveMoment(progress: MomentProgress) {
    if (!campaign?.tactics || campaign.completedMatches.length) return;
    const setup = simulateMatch(campaign.seed, campaign.tactics);
    const moment = replayMoment(campaign.seed, campaign.tactics, progress);
    if (!moment.outcome) return;
    const match = completeMatch(setup, moment.outcome, campaign.tactics, campaign.seed, progress);
    saveCampaign(recordMatch(campaign, match));
  }

  function resetSlice() {
    resetCampaign(window.localStorage);
    setCampaign(null);
  }

  function start() {
    setSelected(false);
    persist('nation', null);
    setView('nation');
  }

  function continueCampaign() {
    if (!savedState) return;
    setSelected(savedState.nation === 'Argentina');
    setView(savedState.screen);
  }

  if (view === 'opening') return <OpeningScreen hasCampaign={savedState != null} onStart={start} onContinue={continueCampaign} />;
  if (view === 'nation') return <NationScreen selected={selected} onSelect={() => setSelected(true)} onBack={() => setView('opening')} onChoose={() => { persist('draw', 'Argentina'); setView('draw'); }} />;
  if (view === 'draw') return <DrawScreen reducedMotion={reducedMotion} onBack={() => { persist('nation', 'Argentina'); setSelected(true); setView('nation'); }} onComplete={() => { persist('campaign', 'Argentina'); setView('campaign'); }} />;
  if (campaign?.stage === 'tactics') return <TacticsClipboard tactics={campaign.tactics ?? DEFAULT_TACTICS} onChange={setTactics} onKickOff={kickOff} onBack={() => saveCampaign({ ...campaign, stage: 'campaign', tactics: null, moment: { tick: 0, events: [] } })} />;
  if (campaign?.stage === 'match-story') return <MatchStory campaign={campaign} onMoment={startMoment} onBack={() => saveCampaign({ ...campaign, stage: 'tactics' })} />;
  if (campaign?.stage === 'moment') return <LastChanceMoment campaign={campaign} reducedMotion={reducedMotion} onProgress={updateMoment} onComplete={resolveMoment} />;
  if (campaign?.stage === 'result') return <FullTimeArtifact campaign={campaign} onReturn={() => saveCampaign({ ...campaign, stage: 'campaign-complete' })} />;
  return <CampaignScreen campaign={campaign} onPlay={openTactics} onReset={resetSlice} />;
}

export { PROTOTYPE_STORAGE_KEY };
