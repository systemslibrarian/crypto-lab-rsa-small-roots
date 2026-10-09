import { defineConfig } from 'vitest/config';
export default defineConfig({ base: '/crypto-lab-rsa-small-roots/', test: { include: ['src/**/*.test.ts'], testTimeout: 60000 } });
