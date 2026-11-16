# Changes in this version

Fixes "Not found" on All Customers > Upload PDF / Excel / JSON / Image, and the other pages whose server routes were missing.

New files (server/src): app.js, pdfPolyfill.js, routes/customerExtract.js, routes/inventoryImport.js, routes/notifications.js, routes/projectQuotations.js
Changed: index.js (now only starts app.js), routes/records.js (customers bulk, inventory bulk, notification triggers),
         routes/employees.js (reset password by email), emailLeads.js (exports COMPANY_SUFFIX), storage.js (UPLOADS_DIR),
         supabase/schema.sql (crm_notifications, crm_project_quotations; applied automatically at start-up)
New test: qa/customer-upload-loop.test.js
Not included: .env (it held live keys: rotate them), node_modules (run `npm install` in server/ and client/)
Not rebuilt: Gmail auto-register / email replies / scan-all (needs live Google credentials)
