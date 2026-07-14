import { type FormEvent, type MouseEvent, useState } from 'react';
import { useAuth } from '../auth/auth-provider';

type PredictionProjection = Readonly<{
  pending: number;
  graded: number;
  correct: number;
  hasPredictions: boolean;
  history: readonly Readonly<{ fixtureId: number; fixtureLabel: string; state: 'pending' | 'correct' | 'incorrect' }>[];
}>;

function LocalPredictions({ predictions }: { predictions: PredictionProjection }) {
  return <section className="v2-you-predictions" aria-labelledby="your-predictions-title">
    <header><h2 id="your-predictions-title">Predictions</h2><span>Device-local</span></header>
    {!predictions.hasPredictions ? <p>No predictions yet. Confirm a pre-kickoff call to start this device-local history.</p> : <>
      <p>{predictions.pending} pending · {predictions.graded} graded · {predictions.correct} correct</p>
      <ul>{predictions.history.map((entry) => {
        const label = entry.state === 'pending' ? 'Pending grade' : entry.state === 'correct' ? 'Correct' : 'Incorrect';
        return <li key={entry.fixtureId}><span>{entry.fixtureLabel}</span><b data-state={entry.state}>{label}</b></li>;
      })}</ul>
    </>}
    <p className="v2-you-predictions__note">These predictions stay on this device. Signing in never uploads, deletes, or changes them.</p>
  </section>;
}

function IdentityBand() {
  return <div className="v2-identity-crest" aria-hidden="true"><span>U</span><b>26</b></div>;
}

export function YouRoute({ predictions, onNavigate }: { predictions: PredictionProjection; onNavigate: (path: string) => void }) {
  const { state, requestEmailCode, retry, signOut, verifyEmailCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function follow(event: MouseEvent<HTMLAnchorElement>) { event.preventDefault(); onNavigate('/v2/'); }
  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMessage('Enter a valid email address.'); return; }
    setBusy(true); setMessage(null);
    try { await requestEmailCode(email.trim()); setStep('code'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'We could not send a code. Try again.'); }
    finally { setBusy(false); }
  }
  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setMessage('Enter the six-digit code.'); return; }
    setBusy(true); setMessage(null);
    try { await verifyEmailCode(email.trim(), code); setCode(''); setStep('email'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'That code could not be confirmed.'); }
    finally { setBusy(false); }
  }

  return <section className="v2-route v2-you">
    <h1 className="v2-page-title">You</h1>
    <section className="v2-identity-band" aria-labelledby="identity-title" data-auth-state={state.kind}>
      <IdentityBand />
      <div>
        {state.kind === 'checking' ? <><h2 id="identity-title">Checking your session</h2><p>Confirming the existing United sign-in session.</p><span>FLOODLIGHT · Session check</span></> : null}
        {state.kind === 'configuration-unavailable' ? <><h2 id="identity-title">Sign-in is unavailable</h2><p>This device cannot reach the configured sign-in service right now.</p><button className="v2-button v2-button--quiet" type="button" onClick={retry}>Try again</button></> : null}
        {state.kind === 'signed-out' ? <>
          <h2 id="identity-title">FLOODLIGHT</h2><p>Sign in with the existing United email-code method.</p><span>Predictions remain device-local</span>
          {step === 'email' ? <form className="v2-auth-form" onSubmit={sendCode}><label htmlFor="v2-auth-email">Email</label><input id="v2-auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="v2-button v2-button--primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in code'}</button></form> : <form className="v2-auth-form" onSubmit={confirmCode}><label htmlFor="v2-auth-code">Six-digit code sent to {email}</label><input id="v2-auth-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} /><div className="v2-auth-form__actions"><button className="v2-button v2-button--primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Confirm sign-in'}</button><button className="v2-button v2-button--quiet" type="button" onClick={() => { setStep('email'); setCode(''); setMessage(null); }}>Use another email</button></div></form>}
          {message ? <p className="v2-auth-message" role="status">{message}</p> : null}
          <p className="v2-auth-privacy">Your email is handled by United’s existing sign-in service. This foundation does not build a profile or sync your predictions.</p>
        </> : null}
        {state.kind === 'signed-in' ? <><h2 id="identity-title">Signed in</h2><p>Verified session{state.identity.email ? ` · ${state.identity.email}` : ''}</p><span>FLOODLIGHT · Existing United session</span><dl className="v2-session-identity"><div><dt>Account ID</dt><dd>{state.identity.userId}</dd></div>{state.identity.email ? <div><dt>Verified email</dt><dd>{state.identity.email}</dd></div> : null}</dl><button className="v2-button v2-button--quiet" type="button" onClick={() => void signOut()}>Sign out</button><p className="v2-auth-privacy">Server profiles and cross-device records are not built yet.</p></> : null}
        {state.kind === 'error' ? <><h2 id="identity-title">Session needs attention</h2><p>{state.message}</p><div className="v2-auth-form__actions"><button className="v2-button v2-button--primary" type="button" onClick={retry}>Try again</button>{state.identity ? <button className="v2-button v2-button--quiet" type="button" onClick={() => void signOut()}>Sign out</button> : null}</div></> : null}
      </div>
    </section>
    <LocalPredictions predictions={predictions} />
    <a className="v2-follow-row" href="/v2/" onClick={follow}>Follow the tournament →</a>
    <p className="v2-route-footnote">Identity is limited to the verified session. There are no ranks, records, avatars, or cloud prediction claims here.</p>
  </section>;
}
