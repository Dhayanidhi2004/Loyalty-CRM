// Runs the UI tests (jsdom + the real React page + the real API/Postgres). Usage: node run-ui.js [FLOWS]
const { spawnSync } = require('child_process');
const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.config.mjs'], { stdio: 'inherit', cwd: __dirname, env: { ...process.env, FLOWS: process.argv[2] || process.env.FLOWS || '800' } });
process.exit(r.status ?? 1);
