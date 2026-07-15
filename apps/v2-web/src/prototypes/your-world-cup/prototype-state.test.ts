import { describe, expect, it, vi } from 'vitest';
import { PROTOTYPE_STORAGE_KEY, readPrototypeState, writePrototypeState } from './prototype-state';

describe('Your World Cup prototype state', () => {
  it('reads only the versioned prototype contract', () => {
    expect(readPrototypeState({ getItem: () => JSON.stringify({ version: 1, screen: 'campaign', nation: 'Argentina' }) })).toEqual({ version: 1, screen: 'campaign', nation: 'Argentina' });
    expect(readPrototypeState({ getItem: () => JSON.stringify({ version: 2, screen: 'campaign', nation: 'Argentina' }) })).toBeNull();
    expect(readPrototypeState({ getItem: () => '{broken' })).toBeNull();
  });

  it('writes exactly one isolated key', () => {
    const setItem = vi.fn();
    writePrototypeState({ setItem }, { version: 1, screen: 'draw', nation: 'Argentina' });
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith(PROTOTYPE_STORAGE_KEY, JSON.stringify({ version: 1, screen: 'draw', nation: 'Argentina' }));
  });
});
