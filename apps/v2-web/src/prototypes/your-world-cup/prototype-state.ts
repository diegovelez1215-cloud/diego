export const PROTOTYPE_STORAGE_KEY = 'u26v2.prototype.your-world-cup';

export type PrototypeScreen = 'nation' | 'draw' | 'campaign';

export type PrototypeState = Readonly<{
  version: 1;
  screen: PrototypeScreen;
  nation: 'Argentina' | null;
}>;

function isPrototypeState(value: unknown): value is PrototypeState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PrototypeState>;
  return candidate.version === 1
    && (candidate.screen === 'nation' || candidate.screen === 'draw' || candidate.screen === 'campaign')
    && (candidate.nation === null || candidate.nation === 'Argentina');
}

export function readPrototypeState(storage: Pick<Storage, 'getItem'>): PrototypeState | null {
  try {
    const raw = storage.getItem(PROTOTYPE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPrototypeState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePrototypeState(storage: Pick<Storage, 'setItem'>, state: PrototypeState) {
  storage.setItem(PROTOTYPE_STORAGE_KEY, JSON.stringify(state));
}
