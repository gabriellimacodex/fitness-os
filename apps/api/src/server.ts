import { bootstrapApi } from './bootstrap.js';

await bootstrapApi().catch(() => {
  process.exitCode = 1;
});
