"""Browser sweep: for every login, open every reachable page and click every button / tab / link once (skipping destructive ones),
open every pop-up, and record crashes, console errors and failed API calls.
   python3 browser-sweep.py [http://localhost:5173] [outdir]   (needs browser-server.js running)"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'sweep-out'
CHROME = os.environ.get('CHROME', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
os.makedirs(OUT, exist_ok=True)
ROLES = ['admin', 'head', 'sales', 'eng', 'svc', 'invmgr', 'filler', 'stock']
SKIP = re.compile(r'logout|delete|remove|disconnect|discard|connect gmail|scan|reconnect|print|save as pdf|^\s*$|^×$|mark all read|clear', re.I)
MAX_PAGES, MAX_CLICKS = 40, 30

async def sweep(browser, role):
    ctx = await browser.new_context(viewport={'width': 1366, 'height': 900})
    await ctx.route('https://accounts.google.com/**', lambda r: r.abort())
    page = await ctx.new_page()
    report = {'role': role, 'pages': {}, 'errors': []}
    cur = {'url': ''}
    def err(kind, text):
        e = {'page': cur['url'], 'kind': kind, 'text': text[:300]}
        if e not in report['errors']:
            report['errors'].append(e)
    page.on('pageerror', lambda e: err('crash', str(e)))
    page.on('console', lambda m: m.type == 'error' and not re.search(r'favicon|Failed to load resource', m.text) and err('console', m.text))
    async def on_resp(r):
        if '/api/' in r.url and r.status >= 400 and not r.url.endswith('/api/auth/login'):
            err(f'api {r.status}', f'{r.request.method} {r.url.replace(BASE, "")}')
    page.on('response', lambda r: asyncio.ensure_future(on_resp(r)))
    page.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    ctx.on('page', lambda p: asyncio.ensure_future(p.close()))  # PDF / print tabs are visited directly instead

    await page.goto(BASE + '/login')
    await page.fill('#email', f'{role}@qa.test'); await page.fill('#password', 'Pass@123'); await page.click('.btn-login')
    await page.wait_for_timeout(1500)
    home = page.url.replace(BASE, '')
    queue, seen = [home], set()
    while queue and len(seen) < MAX_PAGES:
        url = queue.pop(0)
        if url in seen: continue
        seen.add(url); cur['url'] = url
        await page.goto(BASE + url); await page.wait_for_timeout(1100)
        if '/login' in page.url:
            err('logged out', url); break
        title = (await page.locator('h1, h2, h3').first.inner_text()) if await page.locator('h1, h2, h3').count() else ''
        info = {'title': title.strip()[:60], 'clicked': [], 'modals': [], 'links': []}
        report['pages'][url] = info
        await page.screenshot(path=f'{OUT}/{role}_{len(seen):02d}.png')
        # links to other pages (incl. PDF / print pages)
        for href in await page.eval_on_selector_all('a[href^="/"]', 'els => els.map(e => e.getAttribute("href"))'):
            h = href.split('#')[0]
            if h and h not in seen and h not in queue and not h.startswith('/uploads'): queue.append(h); info['links'].append(h)
        # clickable things, one per distinct label
        sel = 'main button, .frame button, .frame [role=tab], .frame a[href]'
        labels, n = [], await page.locator(sel).count()
        for i in range(min(n, 120)):
            el = page.locator(sel).nth(i)
            try:
                if not await el.is_visible() or await el.is_disabled(): continue
                t = (await el.inner_text()).strip().split('\n')[0][:40] or (await el.get_attribute('aria-label') or '')
            except Exception:
                continue
            if SKIP.search(t) or t in [x[0] for x in labels]: continue
            labels.append((t, i))
        for t, i in labels[:MAX_CLICKS]:
            if page.url.replace(BASE, '') != url:
                await page.goto(BASE + url); await page.wait_for_timeout(700)
            el = page.locator(sel).nth(i)
            try:
                await el.click(timeout=2500)
            except Exception:
                continue
            await page.wait_for_timeout(650)
            info['clicked'].append(t)
            now = page.url.replace(BASE, '')
            if now != url:
                if now not in seen and now not in queue and '/login' not in now: queue.append(now)
                continue
            if await page.locator('.modal').count():
                mt = await page.locator('.modal h3').first.inner_text() if await page.locator('.modal h3').count() else '?'
                if mt not in info['modals']:
                    info['modals'].append(mt)
                    await page.screenshot(path=f'{OUT}/{role}_{len(seen):02d}_modal_{len(info["modals"])}.png')
                for _ in range(3):
                    if not await page.locator('.modal').count(): break
                    await page.keyboard.press('Escape'); await page.wait_for_timeout(250)
    await ctx.close()
    return report

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME)
        reports = await asyncio.gather(*[sweep(browser, r) for r in ROLES])
        await browser.close()
    json.dump(reports, open(f'{OUT}/report.json', 'w'), indent=1)
    total = 0
    for r in reports:
        clicks = sum(len(p['clicked']) for p in r['pages'].values())
        modals = sum(len(p['modals']) for p in r['pages'].values())
        total += len(r['errors'])
        print(f"{r['role']:7} pages={len(r['pages']):3} clicks={clicks:4} popups={modals:3} problems={len(r['errors'])}")
        for e in r['errors']: print(f"   ! [{e['kind']}] {e['page']} :: {e['text']}")
    print('TOTAL PROBLEMS', total)

asyncio.run(main())
