# CRM test report — 24 Oct 2026

Everything below was run against the real server code (`server/src`) and the real website (`client/src`), on an in-memory
Postgres with the same schema as Supabase. Google (Gmail sign-in, inbox) is simulated and behaves like Google's real errors.

## Results
| Suite | What it does | Result |
|---|---|---|
| `full-sweep.test.js` | Every login type, every section, every action: registration, logins, reset email/password, disable/delete; **each of the 11 modules × 8 roles** (open list, add, open/edit own, open/edit others', delete, who sees what); lead workflow; totals and numbers; bulk imports; all uploads with real files; project quotations; paging/search/errors | **555 / 555** |
| `crm-features.test.js` | Reset by email, inventory Excel, manual quotations, notifications, Gmail auto-register, replies, Gmail sign-in round trip | **137 / 137** |
| `browser-sweep.py` | Real browser, all 8 logins: opens every reachable page, clicks every button/tab/link, opens every pop-up (≈120 pages, 414 clicks, 33 pop-ups) and records crashes, console errors and failed requests | **0 problems** |
| `browser-flows.py` | Real browser: fills and submits the main forms as each login (add employee with photo + document, reset password, customer documents upload, inventory Excel + manual, manual quotation + PDF, enquiry, assign, PO, PI, quotation, work visit, product request, stock, notifications) | **29 / 29** |
| `load-test.js 80 60` | 80 people (all roles) working at once for 60 s, ≈10,000 actions, then checks numbers, totals, stock, visibility | **10 / 10**, 0 failed requests |
| `api.test.js`, `ui.test.jsx`, `draft-quotation.test.js` | earlier Project Quotations / draft quotation suites | **5,131 / 0 failures**, **19 / 19**, **7 / 7** |

## Problems found and fixed in this round
1. **PDF upload failed: "DOMMatrix is not defined"** (Customers → Upload). The PDF reader needs a native add-on that was missing for the
   server's computer. Fixed with a built-in stand-in (`server/src/pdfPolyfill.js`).
2. **Our own quotation PDF was read as "Loyalty Automation"** (our name, GSTIN, phone, email) instead of the customer. The reader now
   ignores our own details and reads the Consignee / M/s / Bill To block.
3. **A customer's PO** gave "Loyalty Automation" from its "To:" block. Fixed.
4. **A PDF listing several customers** gave only one, with a wrong name. Now one customer per row.
5. **GST certificate address** swallowed the next line ("5. Date of Liability …"). Fixed.
6. **Visiting card**: the person's name was lost. Now read from "Name – Designation".
7. **Scanned PDFs** were refused. The page images are now read with OCR.
8. **.tsv, .xlsm and .gif** were offered in the file picker but then refused. Now read.
9. **Large inventory Excel imports** (several thousand rows) would hit the 2 MB request limit. Sent in parts, limit raised to 10 MB.
10. **Uploads accepted any file type** (an uploaded .html page could run inside the CRM). Now only pictures, PDF and office files; the
    profile photo must be a picture; documents download instead of opening as a page; Tamil file names are kept.
11. **Personal dashboard counts** for a Sales Employee ignored enquiries assigned to them (not shown on screen today, fixed for later).
12. **Tax invoices (Tally style) gave "(Bill to)" / "(Ship to)" as the company** and our own email (OCR read "loyalty" as "ioyalty").
    The company now comes from the file name when it names one ("1108_AVO Carbon India Private Limited - Chennai.pdf"), labels like
    "(Bill to)" are never taken as names, OCR misreadings of our own name/email are ignored, and a GST number misread by OCR is
    repaired only when its check character proves it right.
13. **Pop-ups opened inside dashboard tabs** were drawn under the table (fixed earlier, re-checked).

## Behaviour checked and correct (not bugs)
- After saving a Purchase Order / Proforma Invoice the form returns to the page you came from.
- If two Sales Heads assign the same new enquiry at the same moment, the later one wins and the first Sales Employee gets
  "Not allowed" on it (6 times in the load test, all explained).
- 80 people logging in in the very same second: the slowest login took ~9 s (passwords are checked slowly on purpose).

## Not covered here (check on your side)
- Real Google sign-in and a real Gmail inbox, real Supabase database and storage, your hosting provider.
- Response times on Supabase will differ from this in-memory database (here: median ≈ 0.4 s with 80 people at once).
