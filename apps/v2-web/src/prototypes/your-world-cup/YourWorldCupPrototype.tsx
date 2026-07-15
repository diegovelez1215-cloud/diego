import { useEffect, useMemo, useState } from 'react';
import { PROTOTYPE_STORAGE_KEY, readPrototypeState, writePrototypeState, type PrototypeScreen } from './prototype-state';
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

function GroupTable() {
  return (
    <div className="ywc-group-table">
      <div className="ywc-tape ywc-tape--table" aria-hidden="true" />
      <div className="ywc-artifact-title"><span>Group C</span><b>Before kickoff</b></div>
      <div className="ywc-table-head"><span>Nation</span><span>PL</span><span>GD</span><span>PTS</span></div>
      {group.map((team, index) => (
        <div className={`ywc-table-row${index === 0 ? ' is-you' : ''}`} key={team.code}>
          <span><Flag name={team.flag} />{team.name}</span><b>0</b><b>0</b><b>0</b>
        </div>
      ))}
      <p className="ywc-table-scrawl">top two keep the dream alive</p>
    </div>
  );
}

function CampaignScreen({ onPlay, showMessage }: { onPlay: () => void; showMessage: boolean }) {
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
        <div className="ywc-wall__table"><GroupTable /></div>
        <article className="ywc-next-ticket">
          <div className="ywc-ticket-stub" aria-hidden="true">C26<br />001</div>
          <p>Matchday 1 · Group C</p>
          <h2><span><Flag name="argentina" /> Argentina</span><i>v</i><span><Flag name="nigeria" /> Nigeria</span></h2>
          <dl><div><dt>When</dt><dd>Friday · 20:00</dd></div><div><dt>Where</dt><dd>Atlanta · Gate C</dd></div></dl>
          <b className="ywc-ticket-callout">NEXT MATCH</b>
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
        {showMessage ? <p className="ywc-prototype-message" role="status">Playable match moment comes in the next vertical slice.</p> : null}
        <button type="button" className="ywc-button ywc-button--pink" onClick={onPlay}>Play Argentina v Nigeria <span aria-hidden="true">→</span></button>
      </div>
    </main>
  );
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function YourWorldCupPrototype() {
  const initialState = useMemo(() => readPrototypeState(window.localStorage), []);
  const [savedState, setSavedState] = useState(initialState);
  const [view, setView] = useState<View>('opening');
  const [selected, setSelected] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  useEffect(() => {
    document.title = 'Your World Cup — United 26 Prototype';
  }, []);

  function persist(screen: PrototypeScreen, nation: 'Argentina' | null) {
    const next = { version: 1, screen, nation } as const;
    writePrototypeState(window.localStorage, next);
    setSavedState(next);
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
  return <CampaignScreen showMessage={showMessage} onPlay={() => setShowMessage(true)} />;
}

export { PROTOTYPE_STORAGE_KEY };
