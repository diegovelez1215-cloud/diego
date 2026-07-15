import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directPrototypeRoute = {
  name: 'direct-your-world-cup-route',
  closeBundle() {
    const output = resolve(process.cwd(), 'public/v2');
    const direct = resolve(output, 'your-world-cup-prototype');
    mkdirSync(direct, { recursive: true });
    copyFileSync(resolve(output, 'index.html'), resolve(direct, 'index.html'));
  },
};

export default defineConfig({
  root: 'apps/v2-web',
  base: '/v2/',
  plugins: [react(), directPrototypeRoute],
  build: {
    outDir: '../../public/v2',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
