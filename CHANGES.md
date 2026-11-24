<<<<<<< HEAD
# Email Leads for every login

- server/src/roles.js: `emailLeads: 'own'` added to Sales Head, Engineer, Service Engineer, Sales Employee, Inventory Manager, Stock Filler (Lead Filler and Admin already had it).
- server/src/routes/gmail.js: after Connect Gmail, each login returns to its own Email Leads page.
- client: new routes /emailLeads and /emailLeads/enquiry; Email Leads button on the Sales (Analytics), Service Engineer and Engineer dashboards; notification links; Create Enquiry button only for roles that can create leads.
=======
# Quotation PDF format (17 Nov 2026)

- Download PDF now looks exactly like the quotation on screen. Before, the print page (A4) was narrower than the
  mobile breakpoint, so the layout collapsed into one column; the mobile layout now applies to screens only.
  The PDF also no longer carries the browser's date / URL header and footer.
- Project Quotations use the same quotation format (letterhead, TO band, item table, terms, totals, amount in words,
  stamp and footer) for viewing, editing and the PDF. New PDF button on each project quotation (/pdf/project/:id),
  with Edit on the PDF page opening that quotation in edit mode. New optional Enquiry No field.
- Changed: client/src/pages.css, client/src/pages/DocumentPdf.jsx, client/src/pages/ProjectQuotations.jsx,
  client/src/pages/project-quotations.css, server/src/routes/projectQuotations.js (GET /:id, enq), qa/ui.test.jsx
>>>>>>> 0c50e2c49fa764a2f4fb45b8841ce2c2a15285f9

# Changes in this version

Fixes "Not found" on All Customers > Upload PDF / Excel / JSON / Image, and the other pages whose server routes were missing.

New files (server/src): app.js, pdfPolyfill.js, routes/customerExtract.js, routes/inventoryImport.js, routes/notifications.js, routes/projectQuotations.js
Changed: index.js (now only starts app.js), routes/records.js (customers bulk, inventory bulk, notification triggers),
         routes/employees.js (reset password by email), emailLeads.js (exports COMPANY_SUFFIX), storage.js (UPLOADS_DIR),
         supabase/schema.sql (crm_notifications, crm_project_quotations; applied automatically at start-up)
New test: qa/customer-upload-loop.test.js
Not included: .env (it held live keys: rotate them), node_modules (run `npm install` in server/ and client/)
Not rebuilt: Gmail auto-register / email replies / scan-all (needs live Google credentials)
