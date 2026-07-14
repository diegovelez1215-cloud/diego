// V1 is intentionally unchanged. Its public functions are narrowed into the
// V2 contract below so the new surface never relies on untyped payloads.
// @ts-ignore The established V1 client is JavaScript without declarations.
import { AUTH_KEY, boardConfigured, currentUser, fetchMyProfile, loadSession, requestEmailCode, signOut, verifyEmailCode } from '../../../../src/core/leaderboard.js';
import type { AuthCheckResult, AuthClient, LegacyAuthImplementation, LegacyUser, VerifiedIdentity } from './contracts';

const legacyAuth: LegacyAuthImplementation = {
  AUTH_KEY,
  boardConfigured,
  currentUser,
  fetchMyProfile,
  requestEmailCode,
  signOut,
  verifyEmailCode,
  loadSession,
};

export function verifiedIdentity(user: LegacyUser | null | undefined): VerifiedIdentity | null {
  if (!user || typeof user.id !== 'string' || !user.id) return null;
  return Object.freeze({ userId: user.id, email: typeof user.email === 'string' && user.email ? user.email : null });
}

function configurationReady(legacy: LegacyAuthImplementation, timeoutMs: number): Promise<boolean> {
  if (legacy.boardConfigured()) return Promise.resolve(true);
  if (typeof fetch !== 'function') return Promise.resolve(false);
  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    let complete = false;
    const finish = () => {
      if (complete) return;
      complete = true;
      window.removeEventListener('u26:leaderboard-config', finish);
      window.clearTimeout(timeout);
      resolve(legacy.boardConfigured());
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    window.addEventListener('u26:leaderboard-config', finish, { once: true });
  });
}

export function createAuthClient(legacy: LegacyAuthImplementation = legacyAuth, { configTimeoutMs = 10_000 }: { configTimeoutMs?: number } = {}): AuthClient {
  async function checkSession(): Promise<AuthCheckResult> {
    if (!await configurationReady(legacy, configTimeoutMs)) return Object.freeze({ kind: 'configuration-unavailable' });

    const stored = legacy.loadSession();
    if (!stored || !verifiedIdentity(legacy.currentUser())) return Object.freeze({ kind: 'signed-out' });

    try {
      // This is the existing client's authenticated path. It performs the
      // established expiry/401 refresh handling without V2 touching tokens.
      await legacy.fetchMyProfile();
    } catch {
      const identity = verifiedIdentity(legacy.currentUser());
      return identity
        ? Object.freeze({ kind: 'error', message: 'We could not confirm your session. Try again.', identity })
        : Object.freeze({ kind: 'signed-out' });
    }

    const identity = verifiedIdentity(legacy.currentUser());
    return identity ? Object.freeze({ kind: 'signed-in', identity }) : Object.freeze({ kind: 'signed-out' });
  }

  return Object.freeze({
    checkSession,
    async requestEmailCode(email: string) {
      await legacy.requestEmailCode(email);
    },
    async verifyEmailCode(email: string, code: string) {
      const identity = verifiedIdentity(await legacy.verifyEmailCode(email, code));
      if (!identity) throw new Error('The sign-in response did not include a valid identity.');
      return identity;
    },
    async signOut() {
      await legacy.signOut();
    },
    subscribe(listener: () => void) {
      if (typeof window === 'undefined') return () => {};
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === window.localStorage && (event.key === legacy.AUTH_KEY || event.key === null)) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  });
}
