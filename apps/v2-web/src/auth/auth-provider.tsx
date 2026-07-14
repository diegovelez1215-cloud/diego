import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createAuthClient } from './auth-client';
import type { AuthClient, AuthSessionState, VerifiedIdentity } from './contracts';

type AuthContextValue = Readonly<{
  state: AuthSessionState;
  requestEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  retry: () => void;
  signOut: () => Promise<void>;
}>;

const AuthContext = createContext<AuthContextValue | null>(null);

function toState(result: Exclude<AuthSessionState, Readonly<{ kind: 'checking' }>>): AuthSessionState {
  return result;
}

export function AuthProvider({ children, client }: { children: ReactNode; client?: AuthClient }) {
  const defaultClient = useMemo(() => createAuthClient(), []);
  const activeClient = client || defaultClient;
  const [state, setState] = useState<AuthSessionState>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ kind: 'checking' });
    void activeClient.checkSession().then((result) => {
      if (active) setState(toState(result));
    }).catch(() => {
      if (active) setState({ kind: 'error', message: 'We could not check your session. Try again.', identity: null });
    });
    return () => { active = false; };
  }, [activeClient, attempt]);

  useEffect(() => activeClient.subscribe(() => setAttempt((value) => value + 1)), [activeClient]);

  const requestEmailCode = useCallback(async (email: string) => {
    try {
      await activeClient.requestEmailCode(email);
    } catch {
      throw new Error('We could not send a code. Try again.');
    }
  }, [activeClient]);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    try {
      const identity: VerifiedIdentity = await activeClient.verifyEmailCode(email, code);
      setState({ kind: 'signed-in', identity });
    } catch {
      throw new Error('That code could not be confirmed. Check it and try again.');
    }
  }, [activeClient]);

  const signOut = useCallback(async () => {
    try {
      await activeClient.signOut();
      setState({ kind: 'signed-out' });
    } catch {
      setState((current) => ({ kind: 'error', message: 'We could not sign you out. Try again.', identity: current.kind === 'signed-in' ? current.identity : current.kind === 'error' ? current.identity : null }));
    }
  }, [activeClient]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    requestEmailCode,
    verifyEmailCode,
    retry: () => setAttempt((value) => value + 1),
    signOut,
  }), [requestEmailCode, signOut, state, verifyEmailCode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
