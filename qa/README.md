# CRM automated tests

No Supabase needed: the real server code runs on an in-memory Postgres (PGlite).

    cd qa
    npm install
    node full-sweep.test.js          # every login x every section x every action, uploads with real files (546 checks)
    node crm-features.test.js        # reset by email, inventory Excel, quotations, notifications, Gmail, replies, Gmail sign-in
    node load-test.js 80 60          # 80 people at once for 60 s
    node api.test.js 12000           # Project Quotations random operations
    node draft-quotation.test.js     # draft quotation from email enquiries

Browser tests (need `cd ../client && npm run build` and Python Playwright):

    node browser-server.js 5173 &    # the CRM with sample data; every login uses password Pass@123
    python3 browser-sweep.py http://localhost:5173 sweep-out
    python3 browser-flows.py http://localhost:5173 flows-out

Project Quotations UI tests (jsdom): symlink one React copy, then `npm run test:ui`:

    ln -s ../../client/node_modules/react node_modules/react
    ln -s ../../client/node_modules/react-dom node_modules/react-dom
    (cd ../client && npm install)
    npm run test:ui

Sample upload files used by the tests are in `fixtures/uploads`. Results: REPORT.md.

    node customer-upload-loop.test.js 1000   # Customers > Upload PDF / Excel / JSON / Image, repeated 1,000 times on one running app
