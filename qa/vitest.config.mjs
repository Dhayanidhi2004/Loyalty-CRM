import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.join(here, '..', 'client');
const req = createRequire(path.join(client, 'package.json'));
const react = req('@vitejs/plugin-react');
const nm = (m) => path.join(client, 'node_modules', m);

export default defineConfig({
  plugins: [(react.default || react)()],
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { react: nm('react'), 'react-dom': nm('react-dom'), 'react-router-dom': nm('react-router-dom'), 'lucide-react': nm('lucide-react') },
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { strict: false } },
  test: {
    environment: 'jsdom',
    include: ['ui.test.jsx'],
    globalSetup: ['./ui-global.mjs'],
    css: false,
    server: { deps: { inline: [/@testing-library/] } },
    testTimeout: 1800000,
    hookTimeout: 120000,
    env: { VITE_API_URL: 'http://127.0.0.1:4599' },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
