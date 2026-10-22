import { seedDev } from './dev-fixtures.mjs';
seedDev(process.env.DATA_DIR || 'data');
await import('./serve.mjs');
