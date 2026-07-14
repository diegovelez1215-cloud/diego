import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from './auth-provider';
import type { AuthClient, AuthCheckResult } from './contracts';

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function clientFor(result: AuthCheckResult | Promise<AuthCheckResult>): AuthClient {
  return {
    checkSession: () => Promise.resolve(result),
    requestEmailCode: async () => undefined,
    verifyEmailCode: async () => ({ userId: 'id', email: 'fan@example.com' }),
    signOut: async () => undefined,
    subscribe: () => () => {},
  };
}

function Probe() {
  const { state } = useAuth();
  return <output data-kind={state.kind}>{state.kind === 'signed-in' ? state.identity.email : state.kind === 'error' ? state.message : ''}</output>;
}

async function render(client: AuthClient) {
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<AuthProvider client={client}><Probe /></AuthProvider>); await Promise.resolve(); });
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove(); root = undefined; host = undefined;
});

describe('V2 auth provider session contract', () => {
  it.each<AuthCheckResult>([
    { kind: 'signed-out' },
    { kind: 'signed-in', identity: { userId: 'id', email: 'fan@example.com' } },
    { kind: 'error', message: 'Try again.', identity: null },
    { kind: 'configuration-unavailable' },
  ])('renders the distinct %s state without a blank intermediary', async (result) => {
    const view = await render(clientFor(result));
    expect(view.querySelector('output')?.dataset.kind).toBe(result.kind);
  });

  it('starts in an honest checking state while a session check is pending', async () => {
    let resolve!: (value: AuthCheckResult) => void;
    const view = await render(clientFor(new Promise<AuthCheckResult>((done) => { resolve = done; })));
    expect(view.querySelector('output')?.dataset.kind).toBe('checking');
    await act(async () => { resolve({ kind: 'signed-out' }); await Promise.resolve(); });
    expect(view.querySelector('output')?.dataset.kind).toBe('signed-out');
  });
});
