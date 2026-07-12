import { expect, it } from 'vitest';

it('configures the React act environment for V2 tests', () => {
  expect((globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT).toBe(true);
});
