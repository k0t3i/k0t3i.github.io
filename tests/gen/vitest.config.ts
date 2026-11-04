import { defineConfig } from 'vitest/config';

// The generators of the circuit of the board (npm run gen:circuit): not tests, tools run on demand.
export default defineConfig({
  test: { environment: 'node', include: ['tests/gen/**/*.gen.spec.ts'], testTimeout: 600_000 },
});
