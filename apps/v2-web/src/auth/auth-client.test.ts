import { describe, expect, it, vi } from 'vitest';
import { createAuthClient, verifiedIdentity } from './auth-client';
import type { LegacyAuthImplementation, LegacyUser } from './contracts';

function legacy(overrides: Partial<LegacyAuthImplementation> = {}) {
  let user: LegacyUser | null = { id: 'user-123', email: 'fan@example.com' };
  const implementation: LegacyAuthImplementation = {
    AUTH_KEY: 'u26v2.auth',
    boardConfigured: () => true,
    currentUser: () => user,
    loadSession: () => user ? { access_token: 'existing-session', user } : null,
    fetchMyProfile: vi.fn(async () => null),
    requestEmailCode: vi.fn(async () => undefined),
    verifyEmailCode: vi.fn(async () => user as LegacyUser),
    signOut: vi.fn(() => { user = null; }),
    ...overrides,
  };
  return { implementation, clearUser: () => { user = null; } };
}

describe('V2 auth adapter', () => {
  it('projects only a verified V1 session identity', () => {
    expect(verifiedIdentity({ id: 'stable-id', email: 'fan@example.com', extra: 'ignored' } as LegacyUser)).toEqual({ userId: 'stable-id', email: 'fan@example.com' });
    expect(verifiedIdentity({ id: '', email: 'fan@example.com' })).toBeNull();
    expect(verifiedIdentity(null)).toBeNull();
  });

  it('restores a V1 session through its existing refresh-aware authenticated path', async () => {
    const { implementation } = legacy();
    const client = createAuthClient(implementation);
    await expect(client.checkSession()).resolves.toEqual({ kind: 'signed-in', identity: { userId: 'user-123', email: 'fan@example.com' } });
    expect(implementation.fetchMyProfile).toHaveBeenCalledOnce();
  });

  it('becomes signed out safely when an invalid or expired V1 session is cleared', async () => {
    const state = legacy();
    const invalidSession = { ...state.implementation, fetchMyProfile: vi.fn(async () => { state.clearUser(); throw new Error('expired'); }) };
    const client = createAuthClient(invalidSession);
    await expect(client.checkSession()).resolves.toEqual({ kind: 'signed-out' });
  });

  it('keeps a partial session available only as a recoverable error with sign-out fallback', async () => {
    const { implementation } = legacy({ fetchMyProfile: vi.fn(async () => { throw new Error('network'); }) });
    await expect(createAuthClient(implementation).checkSession()).resolves.toEqual({
      kind: 'error', message: 'We could not confirm your session. Try again.', identity: { userId: 'user-123', email: 'fan@example.com' },
    });
  });

  it('surfaces the existing configuration as unavailable without inventing a second client', async () => {
    const { implementation } = legacy({ boardConfigured: () => false });
    await expect(createAuthClient(implementation, { configTimeoutMs: 0 }).checkSession()).resolves.toEqual({ kind: 'configuration-unavailable' });
  });

  it('uses the existing email-code methods and no redirect or token persistence API', async () => {
    const { implementation } = legacy();
    const client = createAuthClient(implementation);
    await client.requestEmailCode('fan@example.com');
    await expect(client.verifyEmailCode('fan@example.com', '123456')).resolves.toEqual({ userId: 'user-123', email: 'fan@example.com' });
    expect(implementation.requestEmailCode).toHaveBeenCalledWith('fan@example.com');
    expect(implementation.verifyEmailCode).toHaveBeenCalledWith('fan@example.com', '123456');
    expect(JSON.stringify(implementation)).not.toContain('setItem');
  });

  it('subscribes to browser session changes through the existing session key only', () => {
    const { implementation } = legacy();
    const client = createAuthClient(implementation);
    const listener = vi.fn();
    const stop = client.subscribe(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-key', storageArea: window.localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'u26v2.auth', storageArea: window.localStorage }));
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });

  it('signs out through the existing trusted client', async () => {
    const { implementation } = legacy();
    await createAuthClient(implementation).signOut();
    expect(implementation.signOut).toHaveBeenCalledOnce();
  });

  it('does not resolve sign-out before an asynchronous V1 sign-out finishes', async () => {
    let finish!: () => void;
    const { implementation } = legacy({ signOut: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
    const client = createAuthClient(implementation);
    let resolved = false;
    const pending = client.signOut().then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    finish();
    await pending;
    expect(resolved).toBe(true);
  });
});
