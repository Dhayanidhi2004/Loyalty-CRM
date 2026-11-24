import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { start } = require('./harness.js');
let h;
export async function setup({ provide }) {
  h = await start(4599);
  provide('tokens', h.tokens);
}
export async function teardown() { h?.server.close(); }
