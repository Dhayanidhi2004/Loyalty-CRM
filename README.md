# Project Quotations – automated tests

Runs the real Express router + real Postgres (PGlite, in-process) and the real React page in jsdom.

    cd qa
    npm install
    # symlink one React copy (needed so the UI tests and the client share it)
    ln -s ../../client/node_modules/react node_modules/react
    ln -s ../../client/node_modules/react-dom node_modules/react-dom
    (cd ../client && npm install)
    npm run test:api        # node api.test.js 12000   (random operations, model-checked)
    npm run test:ui         # node run-ui.js 1000      (19 scenarios + random UI flows)

Set SEED=<n> to replay a run. Needs no Supabase/DATABASE_URL.
