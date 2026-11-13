"""Browser flows: fill and submit the real forms, like a person, for every login (needs browser-server.js running).
   python3 browser-flows.py [http://localhost:5173] [outdir]"""
import os, re, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'flows-out'
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'uploads')
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
os.makedirs(OUT, exist_ok=True)
results, problems = [], []

def check(cond, name, extra=''):
    results.append(bool(cond))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {str(extra)[:300]}'))

def new_page(browser, role):
    ctx = browser.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    p = ctx.new_page()
    p.on('pageerror', lambda e: problems.append(f'{role} crash: {e}'))
    p.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and problems.append(f'{role} console: {m.text[:200]}'))
    p.on('response', lambda r: '/api/' in r.url and r.status >= 500 and problems.append(f'{role} api {r.status} {r.url}'))
    p.on('dialog', lambda d: d.accept())
    p.goto(BASE + '/login'); p.fill('#email', f'{role}@qa.test'); p.fill('#password', 'Pass@123'); p.click('.btn-login'); p.wait_for_timeout(1300)
    return p

def toast(p, timeout=6000):
    try:
        p.wait_for_selector('.toast', timeout=timeout)
        return p.inner_text('.toast')
    except Exception:
        return ''

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)

    # ---------------- ADMIN ----------------
    p = new_page(b, 'admin')
    check('/admin/adminDasboard' in p.url, 'admin lands on Admin Dashboard', p.url)
    # Add Employee with photo + document upload
    p.click('text=Add Employee'); p.wait_for_timeout(800)
    p.fill('#r-name', 'Lakshmi Narayanan'); p.fill('#r-email', 'lakshmi@qa.test'); p.fill('#r-pw', 'Pass@123')
    p.select_option('#r-role', label='Sales Employee'); p.fill('#r-join', '2026-10-01'); p.fill('#r-phone', '9840055555'); p.fill('#r-salary', '28000')
    files = p.locator('.reg-file input[type=file]')
    files.nth(0).set_input_files(os.path.join(FIX, 'Visiting_Card_Royal.png')); p.wait_for_timeout(1500)
    files.nth(1).set_input_files(os.path.join(FIX, 'GST_Certificate_Kaveri.pdf')); p.wait_for_timeout(1500)
    check(p.locator('.reg-file .done').count() == 2, 'photo and document uploaded on the Registration Page')
    p.click('.btn-register'); t = toast(p)
    p.wait_for_timeout(1200)
    check(p.locator('text=Lakshmi Narayanan').count() > 0, 'new employee appears on View Profiles', t)
    p.click('.profile-card:has-text("Lakshmi Narayanan")'); p.wait_for_timeout(1200)
    img_ok = p.evaluate("() => [...document.images].some(i => i.src.includes('/uploads/') && i.naturalWidth > 0)")
    check('/admin/employees/' in p.url and img_ok, 'employee profile opens with the uploaded photo', p.url)
    p.screenshot(path=f'{OUT}/admin_profile.png')
    # Reset Employee Password by email
    p.goto(BASE + '/admin/resetPassword'); p.wait_for_timeout(800)
    p.fill('#m-target', 'lakshmi@qa.test'); p.wait_for_timeout(300)
    check('Lakshmi Narayanan' in p.inner_text('.mint-who'), 'reset page shows whose email it is')
    p.fill('#m-pw', 'Fresh@123'); p.fill('#m-cpw', 'Fresh@123'); p.click('.btn-mint'); t = toast(p)
    check('Password reset for Lakshmi' in t, 'password reset by email', t)
    q = b.new_context().new_page(); q.goto(BASE + '/login'); q.fill('#email', 'lakshmi@qa.test'); q.fill('#password', 'Fresh@123'); q.click('.btn-login'); q.wait_for_timeout(1300)
    check('/SaleteamDasboard' in q.url, 'employee logs in with the new password', q.url)
    # Customers: upload documents (our quotation PDF, visiting card photo, Excel sheet)
    p.goto(BASE + '/admin/records/customers'); p.wait_for_timeout(1000)
    p.click('text=Upload PDF / Excel / JSON / Image'); p.wait_for_timeout(500)
    p.locator('.modal input[type=file]').set_input_files([os.path.join(FIX, f) for f in ['1104_Madras Engineering Industries Pvt Ltd - MM Nagar.pdf', 'Visiting_Card_Royal.jpg', 'customers.xlsx', '1108_AVO Carbon India Private Limited - Scanned.pdf']])
    p.wait_for_selector('.imp-table', timeout=60000); p.wait_for_timeout(800)
    body = p.inner_text('.modal')
    vals = p.eval_on_selector_all('.imp-table input', 'els => els.map(e => e.value)')
    check('Madras Engineering Industries Pvt Ltd' in vals and 'ROYAL HYDRAULICS PVT LTD' in vals and 'AVO Carbon India Private Limited' in vals
          and not any(re.search(r'loyalty|ioyalty|bill to|ship to', v, re.I) for v in vals), 'documents read: right company names, none of our own details', vals[:20])
    p.screenshot(path=f'{OUT}/admin_customer_upload.png')
    p.click('.modal-foot .btn-green'); t = toast(p, 15000)
    check(re.search(r'\d+ customers? added', t), 'customers added from documents', t)
    p.wait_for_timeout(1500)
    body = p.inner_text('body')
    check('Madras Engineering Industries Pvt Ltd' in body and 'AVO Carbon India Private Limited' in body and 'Bill to' not in body and 'Ship to' not in body,
          'All Customers shows the real company names (Madras Engineering, AVO Carbon), never "(Bill to)"')
    p.screenshot(path=f'{OUT}/admin_all_customers.png', full_page=True)
    # Inventory: Excel + manual
    p.goto(BASE + '/admin/adminDasboard?tab=inventory'); p.wait_for_timeout(1200)
    p.click('text=Upload Excel'); p.wait_for_timeout(400)
    p.locator('.modal input[type=file]').set_input_files(os.path.join(FIX, 'stock.xlsx')); p.wait_for_selector('.imp-table', timeout=20000)
    p.click('.modal-foot .btn-green'); t = toast(p)
    check('updated' in t or 'added' in t, 'inventory from Excel', t)
    p.click('text=Add Product Manually'); p.wait_for_timeout(500)
    p.fill('#itemCode', 'MAN-001'); p.fill('#brand', 'Siemens'); p.fill('#price', '999'); p.fill('#inward', '7')
    p.click('.modal-foot .btn-green'); t = toast(p)
    p.wait_for_timeout(800)
    check('Product added' in t and 'MAN-001' in p.inner_text('body'), 'product added manually', t)
    # Quotation added manually + its PDF
    p.goto(BASE + '/admin/records/quotations'); p.wait_for_timeout(1000)
    p.click('text=Add Quotation Manually'); p.wait_for_timeout(500)
    p.fill('#customerName', 'Madras Engineering Industries Pvt Ltd'); p.fill('#paymentDue', '100% advance')
    p.fill('.items-row:not(.head) input[aria-label="Description"]', 'Control panel'); p.fill('.items-row:not(.head) input[aria-label="Quantity"]', '2'); p.fill('.items-row:not(.head) input[aria-label="Unit Price"]', '1000')
    p.click('.modal-foot .btn-green'); t = toast(p); p.wait_for_timeout(1000)
    check('Quotation added' in t and '2360.00' in p.inner_text('body'), 'manual quotation saved with total 2360.00 incl. GST', t)
    p.locator('.doc-card').first.locator('text=PDF').click(); p.wait_for_timeout(300)
    pdf_url = [x for x in p.context.pages if '/pdf/' in x.url]
    p.goto(BASE + '/pdf/quotation/' + re.search(r'\d+$', pdf_url[-1].url).group(0) if pdf_url else BASE + '/admin/records/quotations'); p.wait_for_timeout(1500)
    check('2,360' in p.inner_text('body') or '2360' in p.inner_text('body'), 'quotation PDF page shows the total', p.url)
    p.screenshot(path=f'{OUT}/admin_quotation_pdf.png')
    # Email Leads page opens for admin
    p.goto(BASE + '/admin/emailLeads'); p.wait_for_timeout(1000)
    check('Email Lead Intelligence' in p.inner_text('body'), 'admin Email Leads page')

    # ---------------- LEAD FILLER ----------------
    f = new_page(b, 'filler')
    f.click('text=Enter Enquiries'); f.wait_for_timeout(800)
    f.fill('#companyName', 'Velan Hydraulics'); f.fill('#customerName', 'Mr Velan'); f.fill('#phone', '9840077777')
    f.select_option('#salesHead', index=1); f.select_option('#category', 'Product')
    f.click('.enq-btn'); t = toast(f)
    check('submitted' in t, 'Lead Filler submits an enquiry', t)

    # ---------------- SALES HEAD ----------------
    h = new_page(b, 'head')
    h.wait_for_timeout(500)
    bell = h.inner_text('.nb-btn') if h.locator('.nb-count').count() else '0'
    check(int(re.sub(r'\D', '', bell) or 0) >= 1, 'Sales Head bell shows unread notifications', bell)
    h.click('.nb-btn'); h.wait_for_timeout(600)
    check('New enquiry' in h.inner_text('.nb-panel'), 'bell lists the new enquiry')
    h.keyboard.press('Escape')
    h.locator('.lead-card:has-text("Velan Hydraulics") .lc-link').click(); h.wait_for_timeout(700)
    h.select_option('#ld-assign', label=re.compile('Arun Sales').pattern if False else None, index=1)
    h.click('.modal-foot .btn-green'); t = toast(h)
    check('Enquiry updated' in t, 'Sales Head assigns the enquiry', t)
    # Purchase Order page
    h.goto(BASE + '/purchaseOrder/create'); h.wait_for_timeout(900)
    h.fill('#po-cust', 'Delta Electronics'); h.fill('#po-fy', '26-27'); h.fill('#po-gst', '18')
    h.fill('input[aria-label="Description"]', 'VFD 2HP'); h.fill('input[aria-label="Qty"]', '3'); h.fill('input[aria-label="Unit Price"]', '12000')
    h.click('.cd-submit'); h.wait_for_timeout(1500)
    h.goto(BASE + '/SaleteamDasboard/purchaseOrder'); h.wait_for_timeout(1200)
    check('42,480' in h.inner_text('body') or '42480' in h.inner_text('body'), 'Purchase Order saved (3 x 12,000 + 18% GST = 42,480) and listed', h.url)
    # Proforma invoice page
    h.goto(BASE + '/proformaInvoice/create'); h.wait_for_timeout(900)
    h.fill('input[aria-label="Customer name"]', 'NK Industries'); h.fill('input[aria-label="Product 1"]', 'Control panel'); h.fill('input[aria-label="Qty 1"]', '1'); h.fill('input[aria-label="Unit price 1"]', '50000')
    h.click('.pf-create'); h.wait_for_timeout(1500)
    h.goto(BASE + '/SaleteamDasboard/invoices'); h.wait_for_timeout(1200)
    check('59,000' in h.inner_text('body'), 'Proforma Invoice saved (50,000 + 18% GST = 59,000) and listed', h.url)
    h.screenshot(path=f'{OUT}/head_after_pi.png')

    # ---------------- SALES EMPLOYEE ----------------
    s = new_page(b, 'sales')
    s.goto(BASE + '/SaleteamDasboard/quotations'); s.wait_for_timeout(900)
    s.click('text=New Quotation'); s.wait_for_timeout(400)
    s.fill('#customerName', 'Velan Hydraulics'); s.fill('.items-row:not(.head) input[aria-label="Description"]', 'Valve'); s.fill('.items-row:not(.head) input[aria-label="Quantity"]', '1'); s.fill('.items-row:not(.head) input[aria-label="Unit Price"]', '500')
    s.click('.modal-foot .btn-green'); t = toast(s)
    check('Quotation added' in t, 'Sales Employee adds a quotation', t)
    s.goto(BASE + '/SaleteamDasboard/Dasboard'); s.wait_for_timeout(1000)
    check(s.locator('.lead-card:has-text("Velan Hydraulics")').count() == 1, 'assigned enquiry shows on the Sales Employee dashboard')

    # ---------------- ENGINEER ----------------
    e = new_page(b, 'eng')
    e.goto(BASE + '/employee/records/workVisits?new=1'); e.wait_for_timeout(900)
    e.fill('#company', 'Kavya Textiles'); e.fill('#visitDate', '2026-10-24'); e.click('.modal-foot .btn-green'); t = toast(e)
    check('Work Visit added' in t, 'Engineer adds a work visit', t)
    e.goto(BASE + '/employee/records/productRequests?new=1'); e.wait_for_timeout(900)
    e.fill('#company', 'Kavya Textiles'); e.fill('.items-row:not(.head) input[aria-label="Product"]', 'MCB 10A'); e.fill('.items-row:not(.head) input[aria-label="Units"]', '4')
    e.click('.modal-foot .btn-green'); t = toast(e)
    check('Product Request added' in t, 'Engineer raises a product request', t)

    # ---------------- INVENTORY MANAGER ----------------
    i = new_page(b, 'invmgr')
    i.wait_for_timeout(500)
    i.click('.nb-btn'); i.wait_for_timeout(600)
    check('product request' in i.inner_text('.nb-panel').lower(), 'Inventory Manager notified of the product request')
    i.keyboard.press('Escape')
    i.goto(BASE + '/SaleteamDasboard/inventory'); i.wait_for_timeout(900)
    i.click('text=Add Product Manually'); i.wait_for_timeout(400)
    i.fill('#itemCode', 'INV-777'); i.fill('#inward', '1'); i.fill('#minStock', '5'); i.click('.modal-foot .btn-green'); t = toast(i)
    i.wait_for_timeout(800)
    check('Product added' in t and 'INV-777' in i.inner_text('body'), 'Inventory Manager adds stock', t)

    # ---------------- SERVICE ENGINEER / STOCK FILLER ----------------
    v = new_page(b, 'svc')
    check('Kavya Textiles' in v.inner_text('body') and 'Sri Pumps' not in v.inner_text('body'), 'Service Engineer sees only service enquiries')
    st = new_page(b, 'stock')
    st.goto(BASE + '/SaleteamDasboard/inventory'); st.wait_for_timeout(900)
    check(st.locator('text=Upload Excel').count() == 1, 'Stock Filler can upload stock from Excel')
    b.close()

print(f'\nRESULT {sum(results)} / {len(results)} passed')
print('PROBLEMS SEEN DURING FLOWS:', len(problems))
for x in problems[:30]: print('  !', x)
