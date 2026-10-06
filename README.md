# Enterprise CRM

A full CRM with the same look and flow as the reference admin dashboard: green **CRM Login** page, **Admin Dashboard** with the pastel Quick Action buttons, and the **View Profiles / Inventory / Lead Enquiries** tabs. Employees get their own dashboard in the same style.

**Stack:** React (Vite) · Node.js / Express · **Supabase** (Postgres database + Storage for files)

---

## 1. Set up Supabase (5 minutes)

1. Create a project at [supabase.com](https://supabase.com) (pick the **Mumbai / ap-south-1** region for India).
2. Get the database connection string: click **Connect** (top bar) → **Session pooler** → copy the URI. Replace `[YOUR-PASSWORD]` with your database password.
3. (Optional, for photo/PO/PI/quotation uploads) **Project Settings → API**: copy the **Project URL** and the **service_role** key.

The tables are created automatically when the server starts. If you prefer, paste `server/supabase/schema.sql` into **SQL Editor** and run it yourself.

## 2. Configure

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Session pooler URI from step 2 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | From step 3 (leave blank to store uploads in `server/uploads`) |
| `JWT_SECRET` | Any long random string |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin login (created automatically) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Only for Email Leads (see [Email Leads](#email-leads-gmail)) |

> Keep the service_role key only in `server/.env` — never put it in the React app.

## 3. Run

```bash
npm run setup     # installs root, server and client packages
npm run seed      # optional: 6 demo employees + sample leads, quotations, inventory…
npm run dev       # API on :5000, app on http://localhost:5173
```

Log in with `admin@crm.com / admin123` (or whatever you set). Demo employees use password `employee123`, e.g. `karthik@crm.com`.

## 4. Branding

- Put your logo at `client/public/logo.png` (about 260×60). It replaces the text logo automatically.
- Change the company name, tagline and app title in `client/src/config.js`.

---

## What's inside

**Login & Admin dashboard** (`/admin/adminDasboard`, same URL as the original): black frame, the pastel Quick Action buttons, and the View Profiles / Inventory / Lead Enquiries tabs.

**Inner pages** (white frame, dark title, "‹ Back" pill), each laid out like the original screen:

| Quick action | Page |
|---|---|
| Add Employee | **Registration Page**: name, email, password (show/hide), **Role**, joining date, contact number, current salary, address, **Company Resources** (resource, ID, end date, status), profile image, file upload, ending date, remarks |
| Reset Employee Password | green **Reset Password** card: enter the **Employee ID** (`LOY-325332`, or just `325332`); it shows whose account it is, then set the new password. (An employee's email can still be changed from their profile.) |
| Today's Converted / Not Converted | leads closed as Won / Lost today (IST) |
| All Lead Enquiries | **Lead Enquiry**: From/To date + **Fetch Enquiries** |
| All Customers | **Completed Enquiries**: Cus ID / Company / GST / PAN / Date / Delete |
| All PO Requests | **Purchase Order Management** cards → View Details |
| All PI | **Invoice Management** list → detail (customer, reference, financial summary, certification / goods return / interest, product items, cost breakdown, total payable) |
| All Quotations | **Quotation Management** cards → View More (Quotation Details, Terms & Validity, Product Items) |
| All Product Requests | **Product Requests** cards (employee, email, company, contact, employee ID, description, products with units) |
| All Sales Orders | **All Sales Orders** (ID, customer, status, grand total) |
| All Work Visits | **Service Engineers** cards (machine, product description, complaints, assessment) |
| All Service Details | **Service Details** cards (client, EID, inward, quantity, material, model, serial no, power, dates, statuses) |
| All Company Resources | **Company Resources Management**: every employee with their resources, status, edit / delete |

## Analytics Dashboard (Sales Head, Sales Employee, Inventory Manager, Stock Filler)

Sales Head, Sales Employee, Inventory Manager and Stock Filler log in to the **Analytics Dashboard** at `/SaleteamDasboard/Dasboard` (same URL as the original):

- **Buttons:** View Profile, Customer Converted, Overall Customer, Not Converted, Inventory, Purchase Order, Proforma Invoice, View Quotation
- **Stat cards:** Total Leads, Converted, Pending, Conversion Rate
- **Charts:** Enquiry Stages, Priority Levels, Conversion Status (donuts), Enquiry Type Distribution (bars), Daily Lead Trends (last 30 days). Hover any chart for exact numbers.
- **Recent Enquiries:** lead cards with Unassigned / All / Assigned / Quoted / Closed tabs, priority and type filters, View Full Details, a quotation shortcut and Delete

**Sales Head vs Sales Employee:** the Sales Head's second card is **Converted**, and they get the Unassigned tab and the **New Enquiry** button. The Sales Employee's second card is **Closed** (Won + Lost), with All / Assigned / Quoted / Closed tabs and no New Enquiry button: they work the enquiries assigned to them. Each enquiry card has View Full Details, where they change the stage, and a quotation shortcut. An empty account shows "No data available" on the charts and "No enquiries found" under Recent Enquiries.

**Lead pipeline:** New Lead → Assigned → Quoted → Closed: Won / Closed: Lost.
- The Sales Head assigns leads to the sales team in View Full Details; assigning a New Lead moves it to Assigned.
- Creating a quotation from a lead card links it by enquiry number and moves the lead to Quoted.
- "Converted" everywhere means **Closed: Won** and "Not Converted" means **Closed: Lost**. Closing a lead as Won adds the customer to Completed Enquiries.
- A Sales Employee sees the leads assigned to them (and any they created), raises quotations, POs and PIs for them and closes them; customers, quotations, POs and PIs they create stay in their own lists. The Sales Head sees everything and can delete.
- Typical flow: the Lead Filler enters an enquiry for a Sales Head → the Sales Head assigns it to a Sales Employee → the Sales Employee quotes it (Quoted) → closes it as Won (customer added) or Lost.

**Sub-pages:** Profile Information, Customer Converted, Customers Not Converted, Customer Details (PAN / GSTN / company, search), Inventory Management (item code, model, brand, price, inward, outward, current; low stock highlighted), Invoices (View / **PDF** / Delete; PDF opens a printable invoice to save as PDF), Latest Quotations, Purchase Order.

## Creating Purchase Orders and Proforma Invoices

Anyone whose role can create them (Sales Head, Sales Employee, Inventory Manager, Stock Filler) gets full-page forms:

- **Create Purchase Order** (`/purchaseOrder/create`, from **New Purchase Order** on the Purchase Order page): products table (HSN Code, Unit Description, Description, UOM, Qty, Unit Price, Total) with **Add Product**, Payment / Warranty / Delivery Terms, **Financial Year** (the PO number uses it, e.g. `LAP/PO/26-27/006`), GST %, a live **Order Summary** (Total, GST, Final Total = total + GST − discount), LP, Discount, Address Details, Customer Name, GSTIN/UIN, RefQNo, QDate → **Submit Purchase Order**.
- **Proforma Invoice** (`/proformaInvoice/create`, from **Create Invoice** on the Invoices page): laid out like the printed invoice: company header, PI No (generated), PI Date, Ref No, Ref Date, **PO No and PO Date**, purple Consignee block (name, address, GSTIN, state), items (Product, Unit Description, UOM, Qty, Unit Price, Total) with **Add Row**, Terms & Conditions (goods return, interest %, jurisdiction, certification), LP and Discount %, Sub Total, Freight, GST %, Round Off, TOTAL and the **amount in words** → **Create Invoice**.
  - **PO No** lists your purchase orders: picking one fills the PO date and, where still empty, the consignee, items, GST and terms from that PO. You can also type a customer's PO number by hand.
- **Edit** on a PO card or an invoice opens the same form with the saved values. The PDF button prints the invoice with the PO No / PO Date.
- The invoice form, and the PDF, use the same Proforma Invoice layout for every login. Company name, address, phone, email and GSTIN come from `BRAND` in `client/src/config.js`. Images go in `client/public` and appear when present: `logo.png` (letterhead), `stamp.png` (seal above Authorised Signatory) and `brands/delta.png`, `brands/schneider.png`, `brands/phoenix-contact.png`, `brands/motovario.png` (footer).

## Lead Filler

The Lead Filler logs in to their own dashboard at `/leadfiller/dashboard`:

- **Buttons:** View Profile, Enter Enquiries, View Lead Enquiries, Email Leads
- **Recent Enquiries:** their enquiries as cards with All / Assigned / Quoted / Closed tabs ("No enquiries found" when empty), so they can see what the sales team did with each one
- **Enter Enquiries:** the **Sales Head Enquiry** form in four sections: Lead Details (company, contact person, department, lead medium, priority, enquiry type, lead condition), Contact Details (mobile, alternate mobile, email, alternate email), Address Details (address, country, city, postal code, state), Additional Information (description, **Sales Head ID**: pick the Sales Head it goes to). Submit Enquiry creates a New Lead with an `ENQ-######` number.
- **View Lead Enquiries:** table of their enquiries with search, From/To dates, stage tabs and full details.
- A Lead Filler can correct the details of their own enquiries but can't change the stage or assign; that stays with the sales team. The Sales Head sees every enquiry, including who entered it and which Sales Head it was sent to.

### Email Leads (Gmail)

**Email Lead Intelligence Dashboard**: Connect Gmail (Google sign-in, read-only access), then **Scan Inbox**. The server reads the last 30 days of the inbox (skipping Promotions and Social), scores each email for enquiry words (quotation, RFQ, requirement, price, service, AMC…), and drops newsletters, OTPs, alerts and order notifications. Each likely lead shows the sender, company, phone number and city it found, a score and why it scored. **Create Enquiry** opens the enquiry form already filled in; **Ignore** hides it. The status line shows the connected address and how many Sales Heads are available.

Gmail setup (once, about 10 minutes):

1. [Google Cloud Console](https://console.cloud.google.com) → create a project → **APIs & Services → Library** → enable **Gmail API**.
2. **OAuth consent screen**: User type *External* (or *Internal* on Google Workspace), add the scope `https://www.googleapis.com/auth/gmail.readonly`, and add the Lead Filler's Gmail address under **Test users**.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized redirect URI:
   - local: `http://localhost:5173/api/gmail/callback`
   - deployed: `https://your-crm-domain/api/gmail/callback`
4. Put the values in `server/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (exactly the URI above), then restart the server.

Notes:
- While the Google app is in *Testing*, Google expires the connection after 7 days; click Connect Gmail again, or publish the app.
- Gmail tokens are stored encrypted (key derived from `JWT_SECRET`); changing `JWT_SECRET` means connecting again.
- To try the page without Google, set `GMAIL_MOCK=1`: Connect Gmail and Scan Inbox then use a sample inbox.
- The word lists that decide what counts as a lead are at the top of `server/src/emailLeads.js`.

## Service Engineer

The Service Engineer logs in to `/ServiceProject/Dashboard` (same URL as the original): a green **Dashboard** card with **View Profile, Inventory, Get Service Details, Workvisits**, and **Service Project Data**: a table of every enquiry whose Enquiry Type is **Service** (company, contact person, department, lead medium, priority, enquiry type, lead condition, contact number, alternate phone, primary and secondary mail, address, city, state, postal code, country, description, Sales Head, assigned to, stage, enquiry no, date). It scrolls sideways, and clicking a row shows the full enquiry (read only). When there are none it shows "No sales enquiries available".

So a service enquiry entered by the Lead Filler or the Sales Head appears here straight away for the service team. Get Service Details and Workvisits open their own Service Details and Work Visits (add / edit); Inventory is view-only.

## Login roles

The Registration Page's Role list: **Sales Head, Engineer, Service Engineer, Sales Employee, Inventory Manager, Lead Filler, Stock Filler.** Sales Head, Sales Employee, Inventory Manager and Stock Filler get the Analytics Dashboard above, the Lead Filler and Service Engineer get their own dashboards; the Engineer gets a dashboard in the admin's design with buttons only for what they can use:

| Role | Can use |
|---|---|
| Sales Head | the whole team's leads (assign, delete), customers, quotation requests, quotations, POs, PIs (delete), sales orders, work visits; inventory (view) |
| Sales Employee | the same modules, own and assigned records only |
| Engineer | own work visits, service details, product requests; inventory (view) |
| Service Engineer | **Service Engineer dashboard**: all Service-type enquiries (view), own work visits, service details, product requests; inventory (view) |
| Inventory Manager | **Analytics Dashboard** (same 8 buttons + Product Requests; "Closed" card, no Unassigned tab): inventory (add stock, update inward/outward), POs and PIs (create/edit), all product requests, own leads; customers and quotations (view) |
| Lead Filler | **Lead Filler dashboard**: enter enquiries for a Sales Head, see their own enquiries and stages, Email Leads from Gmail |
| Stock Filler | **Analytics Dashboard** (same 8 buttons and "Closed" card as the Sales Employee): inventory (add stock, update inward/outward), own POs and PIs, own leads; customers and quotations (view) |

Everyone sees their own profile and company resources. Only the admin and the Sales Head (on the sales pipeline) can delete. The rules live in **`server/src/roles.js`**: edit that file to change what a role can do, which roles get the sales dashboard, or to add a role (it appears in the dropdown automatically).

Every employee gets an employee ID (`LOY-######`) shown on profiles, product requests, service details, PO cards and Company Resources.

**Built-in calculations** (done on the server when saving):
- PO: total = Σ(qty × price), GST on total, payable = total + GST − discount
- PI: subtotal = items − discount% + freight, GST on subtotal, total payable rounded to the rupee (round-off shown)
- Quotation: GST on items + freight + LP amount
- Sales order: grand total = items + GST
- Numbers: `LAP/PO/26-27/001`, `LAP/PI/26-27/0042`, `LAP/OFF/26-27/28`, `ENQ-######`, `ORD-###`, `CUS-######` (prefix from `DOC_PREFIX`, April–March financial year)
- Inventory: current = inward − outward
- Lead closed as **Closed: Won** → added to Completed Enquiries automatically.

## Demo logins (after `npm run seed`)

| Role | Email | Password |
|---|---|---|
| Admin | admin@crm.com | admin123 |
| Sales Head | saleshead@crm.com | employee123 |
| Sales Employee | sales@crm.com | employee123 |
| Service Engineer | service@crm.com | employee123 |
| Engineer | engineer@crm.com | employee123 |
| Inventory Manager | inventory@crm.com | employee123 |
| Lead Filler | leads@crm.com | employee123 |
| Stock Filler | stock@crm.com | employee123 |

## Add or change fields

All modules are defined in **`server/src/modules.js`**. Add a field there (e.g. `{ key: 'gstNo', label: 'GST No', type: 'text', table: true }`) and it appears in the form, the table, the detail view and the CSV export — no frontend changes needed. Data is stored in one `crm_records` table (`jsonb` column), so no migration is needed either.

## Project structure

```
server/
  src/index.js          Express app, uploads, stats, serves client/dist in production
  src/modules.js        All CRM modules and their fields
  src/routes/auth.js    login, me, self-service password reset
  src/routes/employees.js  add/edit/delete employees, reset email/password (admin)
  src/routes/records.js generic CRUD, filters, totals and role checks for every module
  src/routes/gmail.js   Gmail connection (Google OAuth, read-only), inbox scan, email leads
  src/emailLeads.js     scores an email as a possible enquiry and pulls out company/phone/city
  src/roles.js          what each login role can do
  src/storage.js        Supabase Storage (or local disk fallback)
  src/seed.js           first admin + demo data
  supabase/schema.sql   tables (crm_users, crm_records, crm_counters, crm_gmail, crm_email_leads) with RLS on
client/
  src/pages/            Login, AdminDashboard, EmployeeDashboard, RegisterPage, ResetPage,
                        TablePages (Lead Enquiry, Completed Enquiries, Today's), DocumentsPage (PO),
                        CardPages (Invoice, Quotation, Product Requests, Sales Orders, Service
                        Engineers, Service Details), CompanyResourcesPage, ModulePage (picks the
                        page), EmployeeProfile
  src/pages/sales/      Analytics Dashboard and its pages
  src/pages/leadfiller/ Lead Filler dashboard, enquiry form, enquiry list, Email Leads
  src/access.js         role access helpers (mirror of server roles.js)
  src/components/       Shell (header + frame), RecordsPanel, record forms with line-item editor
  src/config.js         branding, quick-action buttons and colours
  src/styles.css        login + dashboards
  src/pages.css         inner pages
```

## Deploy

One server: `npm run build` then `npm start` — Express serves the built React app and the API from the same port (works on Render, Railway, a VPS…). Set the same environment variables there.

Split hosting (e.g. React on Vercel, API on Render): set `VITE_API_URL=https://your-api.example.com` when building the client, and `CLIENT_ORIGIN=https://your-app.example.com` on the server.

## API (all JSON, `Authorization: Bearer <token>`)

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/login` · `/api/auth/reset-password` | anyone |
| GET | `/api/auth/me` · `/api/modules` · `/api/stats` | logged in |
| GET/POST | `/api/records/:module` (`?search=&status=&from=&to=&today=converted\|notConverted&createdBy=`) | logged in |
| GET/PUT | `/api/records/:module/:id` | owner or admin |
| DELETE | `/api/records/:module/:id` | admin |
| GET/POST/PUT/DELETE | `/api/employees[/:id]` | admin (employees can GET their own) |
| POST | `/api/employees/reset-password` `{empCode \| id \| name, newPassword}` · `/api/employees/reset-email` `{name \| id, newEmail}` | admin |
| POST | `/api/upload` (multipart `file`) | logged in |
| GET | `/api/employees/sales-heads` | anyone who can add enquiries |
| GET | `/api/gmail/status` · `/api/gmail/auth-url` · `/api/gmail/leads?status=` | Lead Filler, admin |
| POST | `/api/gmail/scan` `{days}` · `/api/gmail/disconnect` · PATCH `/api/gmail/leads/:id` `{status}` | Lead Filler, admin |
