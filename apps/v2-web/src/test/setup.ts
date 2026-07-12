// React uses this test-only flag to know that assertions drive its updates.
// It belongs in the test environment rather than product code.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
