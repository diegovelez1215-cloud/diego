export type VerifiedIdentity = Readonly<{
  userId: string;
  email: string | null;
}>;

export type AuthSessionState =
  | Readonly<{ kind: 'checking' }>
  | Readonly<{ kind: 'signed-out' }>
  | Readonly<{ kind: 'signed-in'; identity: VerifiedIdentity }>
  | Readonly<{ kind: 'error'; message: string; identity: VerifiedIdentity | null }>
  | Readonly<{ kind: 'configuration-unavailable' }>;

export type AuthCheckResult =
  | Readonly<{ kind: 'signed-out' }>
  | Readonly<{ kind: 'signed-in'; identity: VerifiedIdentity }>
  | Readonly<{ kind: 'error'; message: string; identity: VerifiedIdentity | null }>
  | Readonly<{ kind: 'configuration-unavailable' }>;

export type LegacySession = Readonly<{
  access_token?: string;
  expires_at?: number;
  user?: LegacyUser | null;
}>;

export type LegacyUser = Readonly<{
  id?: string;
  email?: string | null;
}>;

export type LegacyAuthImplementation = Readonly<{
  AUTH_KEY: string;
  boardConfigured: () => boolean;
  currentUser: () => LegacyUser | null;
  loadSession: () => LegacySession | null;
  fetchMyProfile: () => Promise<unknown>;
  requestEmailCode: (email: string) => Promise<unknown>;
  verifyEmailCode: (email: string, token: string) => Promise<LegacyUser>;
  signOut: () => void | Promise<void>;
}>;

export type AuthClient = Readonly<{
  checkSession: () => Promise<AuthCheckResult>;
  requestEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<VerifiedIdentity>;
  signOut: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
}>;
