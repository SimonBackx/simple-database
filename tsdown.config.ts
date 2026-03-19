import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['index.ts', 'src/classes/data/*.ts'],
    format: ['cjs', 'esm'],
    unbundle: true,
});
