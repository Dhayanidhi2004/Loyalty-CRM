// UI tests: the real <ProjectQuotationsPage/> in jsdom, talking over HTTP to the real Express router + Postgres.
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, inject } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUser = { current: null };
const notify = vi.fn();
vi.mock('../client/src/AppContext', () => ({ useApp: () => ({ user: mockUser.current, notify }) }));
vi.mock('../client/src/components/Shell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../client/src/components/SalesShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../client/src/pages/sales/SalesPages', () => ({ Panel: ({ children }) => <div>{children}</div> }));

import Page from '../client/src/pages/ProjectQuotations.jsx';

const BASE = 'http://127.0.0.1:4599';
const ACCESS = { saleshead: 'full', salesemp: 'own', inventory: 'read', leadfiller: null };
const tokens = inject('tokens');
const asUser = (key) => {
  localStorage.setItem('crm_token', tokens[key]);
  mockUser.current = key === 'admin'
    ? { id: 1, role: 'admin', access: null, dashboard: 'admin' }
    : { id: 2, role: 'employee', access: ACCESS[key] ? { quotations: ACCESS[key] } : {}, dashboard: key === 'leadfiller' ? 'leads' : 'sales' };
};
const srv = async (method = 'GET', path = '', body) => {
  const r = await fetch(`${BASE}/api/project-quotations${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.admin}` }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
const list = async () => (await srv()).items;

let ui;
const mount = async (role = 'admin') => {
  asUser(role);
  ui = render(<MemoryRouter><Page /></MemoryRouter>);
  if (role !== 'leadfiller') await waitFor(() => expect(ui.container.querySelector('.doc-card, .pq-empty')).toBeTruthy());
  return ui;
};
const cards = () => [...ui.container.querySelectorAll('article.doc-card')];
const cardOf = (name) => cards().find((c) => c.textContent.includes(name));
const btn = (scope, label) => within(scope).queryByText(label, { selector: 'button' });
const click = (el) => fireEvent.click(el);
const field = (k) => ui.container.querySelector(`[data-k="${k}"]`);
const cell = (n, f) => ui.container.querySelector(`[data-i="${n}"][data-f="${f}"]`);
const rows = () => ui.container.querySelectorAll('[data-i][data-f="d"]').length;
const type = (el, v) => { el.textContent = v; fireEvent.blur(el); };
const sheetText = () => ui.container.querySelector('.pq-pdf')?.textContent || '';
const isSaved = () => expect(ui.container.textContent).not.toMatch(/Sav(e changes|ing)/);
const save = async () => { click(within(ui.container).getByText('Save changes')); await waitFor(isSaved); };
const sk = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v)));

beforeAll(async () => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
beforeEach(async () => { await fetch(`${BASE}/__reset`, { method: 'POST' }); notify.mockClear(); window.confirm.mockReturnValue(true); });
afterEach(() => cleanup());

describe('the reported bug: Edit / Add item from the card list (project quotation not opened)', () => {
  it('Edit on a card opens the sheet in edit mode', async () => {
    await mount();
    expect(cards().length).toBe(4);
    click(btn(cardOf('NK Industries'), 'Edit'));
    await waitFor(() => expect(ui.container.querySelector('.pq-pdf')).toBeTruthy());
    expect(field('cust').getAttribute('contenteditable')).toBe('plaintext-only');
    expect(within(ui.container).getByText('Save changes')).toBeTruthy();
    expect(within(ui.container).getByText('+ Add item')).toBeTruthy();
  });
  it('+ Add item adds an editable row and it is saved', async () => {
    await mount();
    click(btn(cardOf('Rambal'), 'Edit'));
    await waitFor(() => expect(field('cust')).toBeTruthy());
    const before = rows();
    click(within(ui.container).getByText('+ Add item'));
    await waitFor(() => expect(rows()).toBe(before + 1));
    type(cell(before, 'd'), 'Brand new BOM line'); type(cell(before, 'q'), '4');
    await save();
    const q = (await list()).find((x) => x.cust.includes('Rambal'));
    expect(q.items.length).toBe(before + 1);
    expect(q.items.at(-1)).toMatchObject({ d: 'Brand new BOM line', q: 4 });
  });
  it('Add item twice, then Cancel discards everything', async () => {
    await mount();
    const orig = (await list()).find((x) => x.cust.includes('LNT'));
    click(btn(cardOf('LNT'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    click(within(ui.container).getByText('+ Add item')); click(within(ui.container).getByText('+ Add item'));
    await waitFor(() => expect(rows()).toBe(orig.items.length + 2));
    type(field('cust'), 'Should not be saved');
    click(within(ui.container).getByText('Cancel'));
    await waitFor(() => expect(ui.container.querySelector('.pq-pdf, .pq-pdf')).toBeTruthy().constructor); // sheet stays open, read-only
    expect(field('cust')).toBeNull();
    expect((await list()).find((x) => x.id === orig.id).cust).toBe(orig.cust);
  });
});

describe('editing every part of the sheet', () => {
  it('edits every value on the quotation (customer, bank, HSN/UOM/Qty, terms…) and persists them', async () => {
    await mount();
    click(btn(cardOf('NK Industries'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    const set = { cust: 'NK Industries Ltd', addr: 'Plot 5\nGuindy', ref: 'LAP/OFF/X/1', date: '14-10-2026', enq: 'ENQ-42', proj: 'Panel X', hsn: '8537', uom: 'Nos', qty: '2', price: '1000', bomLabel: 'PARTS', note: 'Be quick', disc: 'None', delivery: '3 days', pay: '30% advance', valid: '10 days', warr: '3 years', gst: '12', bank: 'A : 1\nB : 2\nC : 3' };
    for (const [k, v] of Object.entries(set)) { if (!field(k)) throw new Error(`no editable field ${k}`); type(field(k), v); }
    await save();
    const q = (await list()).find((x) => x.ref === 'LAP/OFF/X/1');
    expect(q).toMatchObject({ ...set, qty: 2, price: 1000, gst: 12 });
    // read-only view shows the new values
    const t = sheetText();
    for (const v of ['LOYALTY AUTOMATION PVT.LTD.', 'QUOTATION', 'ENQ-42', 'Panel X', '8537', 'PARTS', 'None', '3 years', '30% advance', 'Be quick']) expect(t).toContain(v);
  });
  it('totals follow Unit Price × Qty and GST', async () => {
    await mount();
    click(btn(cardOf('Rambal'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    type(field('price'), '1000'); type(field('qty'), '3'); type(field('gst'), '18');
    await save();
    const rec = (await list()).find((x) => x.cust.includes('Rambal'));
    const t = sheetText();
    expect(t).toContain('₹ 3,000.00'); expect(t).toContain('₹ 540.00'); expect(t).toContain('₹ 3,540.00'); expect(t).toContain('Three Thousand Five Hundred Forty');
  });
  it('totals refresh as soon as you leave the Price / Qty / GST cell (before saving)', async () => {
    await mount();
    click(btn(cardOf('Rambal'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    type(field('price'), '₹ 2,000'); type(field('qty'), '2'); type(field('gst'), '5');
    await waitFor(() => expect(ui.container.querySelector('.pq-tt').textContent).toContain('₹ 4,000.00'));
    const tt = ui.container.querySelector('.pq-tt').textContent;
    expect(tt).toContain('₹ 200.00'); expect(tt).toContain('₹ 4,200.00'); expect(field('price').textContent).toBe('2000');
  });
  it('customer shortcut (rambal) fills name and address', async () => {
    await mount();
    click(btn(cardOf('NK Industries'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    type(field('cust'), 'rambal');
    expect(field('cust').textContent).toMatch(/rambal/i);
    expect(field('addr').textContent.length).toBeGreaterThan(0);
  });
  it('Enter blurs single-line fields but is allowed in multi-line fields', async () => {
    await mount();
    click(btn(cardOf('NK Industries'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    expect(fireEvent.keyDown(field('cust'), { key: 'Enter' })).toBe(false); // prevented
    expect(fireEvent.keyDown(field('bank'), { key: 'Enter' })).toBe(true); // allowed
    expect(fireEvent.keyDown(field('addr'), { key: 'Enter' })).toBe(true);
  });
});

describe('BOM rows: add / insert / move / remove / edit', () => {
  it('works in the opened quotation', async () => {
    await mount();
    click(btn(cardOf('NK Industries'), 'Open')); await waitFor(() => expect(ui.container.querySelector('.pq-pdf')).toBeTruthy());
    click(within(ui.container).getByText('Edit', { selector: 'button' })); await waitFor(() => expect(field('cust')).toBeTruthy());
    const n0 = rows(); const d0 = cell(0, 'd').textContent; const d1 = cell(1, 'd').textContent;
    click(ui.container.querySelectorAll('button[title="Move down"]')[0]);
    await waitFor(() => expect(cell(0, 'd').textContent).toBe(d1));
    expect(cell(1, 'd').textContent).toBe(d0);
    click(ui.container.querySelectorAll('button[title="Move up"]')[1]);
    await waitFor(() => expect(cell(0, 'd').textContent).toBe(d0));
    click(ui.container.querySelectorAll('button[title="Insert row below"]')[0]);
    await waitFor(() => expect(rows()).toBe(n0 + 1));
    expect(cell(1, 'd').textContent).toBe('');
    type(cell(1, 'd'), 'Inserted'); type(cell(1, 'u'), 'm'); type(cell(1, 'h'), '9999');
    click(ui.container.querySelectorAll('button[title="Remove row"]')[2]);
    await waitFor(() => expect(rows()).toBe(n0));
    await save();
    const q = (await list()).find((x) => x.cust.includes('NK'));
    expect(q.items[1]).toMatchObject({ d: 'Inserted', u: 'm', h: '9999' });
    expect(q.items.length).toBe(n0);
    expect(ui.container.querySelectorAll('button[title="Move up"]').length).toBe(0); // saved -> read-only
  });
  it('first row cannot move up, last row cannot move down', async () => {
    await mount();
    click(btn(cardOf('LNT'), 'Edit')); await waitFor(() => expect(field('cust')).toBeTruthy());
    const ups = ui.container.querySelectorAll('button[title="Move up"]'); const downs = ui.container.querySelectorAll('button[title="Move down"]');
    expect(ups[0].disabled).toBe(true); expect(downs[downs.length - 1].disabled).toBe(true);
  });
});

describe('search results mode', () => {
  it('Edit + Add item work on search results and stay in the results', async () => {
    await mount();
    fireEvent.change(ui.container.querySelector('.sp-search input'), { target: { value: 'nk' } });
    await waitFor(() => expect(ui.container.querySelectorAll('.pq-result').length).toBe(2));
    click(btn(ui.container.querySelectorAll('.pq-result')[0], 'Edit'));
    await waitFor(() => expect(field('cust')).toBeTruthy());
    const n = rows(); click(within(ui.container).getByText('+ Add item'));
    await waitFor(() => expect(rows()).toBe(n + 1));
    type(cell(n, 'd'), 'From search'); await save();
    expect(ui.container.querySelectorAll('.pq-result').length).toBe(2); // still on the results
    expect((await list()).some((q) => q.items.some((i) => i.d === 'From search'))).toBe(true);
  });
});

describe('new / duplicate / delete', () => {
  it('+ New quotation: needs a customer; Cancel discards; Save adds', async () => {
    await mount();
    click(within(ui.container).getByText('+ New quotation')); await waitFor(() => expect(field('cust')).toBeTruthy());
    click(within(ui.container).getByText('Save changes'));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Customer is required', 'error'));
    expect((await list()).length).toBe(4);
    click(within(ui.container).getByText('Cancel')); await waitFor(() => expect(cards().length).toBe(4));
    expect((await list()).length).toBe(4);
    click(within(ui.container).getByText('+ New quotation')); await waitFor(() => expect(field('cust')).toBeTruthy());
    type(field('cust'), 'Fresh Customer'); type(field('proj'), 'Fresh Project'); type(field('price'), '5000');
    type(cell(0, 'd'), 'Item one');
    await save();
    const l = await list(); expect(l.length).toBe(5);
    expect(l.at(-1)).toMatchObject({ cust: 'Fresh Customer', proj: 'Fresh Project', price: 5000 });
    expect(l.at(-1).items[0].d).toBe('Item one');
    expect(sheetText()).toContain('Fresh Customer'); // opened after save
  });
  it('Duplicate copies items, clears the ref, saves as a new quotation', async () => {
    await mount();
    const src = (await list()).find((q) => q.cust.includes('Rambal'));
    click(btn(cardOf('Rambal'), 'Duplicate')); await waitFor(() => expect(field('cust')).toBeTruthy());
    expect(field('ref').textContent).toBe('');
    expect(rows()).toBe(src.items.length);
    type(field('ref'), 'COPY-1'); await save();
    const l = await list(); expect(l.length).toBe(5);
    const c = l.at(-1); expect(c.ref).toBe('COPY-1'); expect(c.items).toEqual(src.items); expect(c.id).not.toBe(src.id);
  });
  it('Delete asks for confirmation; No keeps it, Yes removes it', async () => {
    await mount();
    window.confirm.mockReturnValue(false);
    click(btn(cardOf('LNT'), 'Delete')); expect((await list()).length).toBe(4);
    window.confirm.mockReturnValue(true);
    click(btn(cardOf('LNT'), 'Delete')); await waitFor(() => expect(cards().length).toBe(3));
    expect((await list()).length).toBe(3);
  });
});

describe('roles', () => {
  it('Sales Head: edit, duplicate, delete, new', async () => {
    await mount('saleshead'); const c = cardOf('NK Industries');
    for (const b of ['Edit', 'Duplicate', 'Delete']) expect(btn(c, b)).toBeTruthy();
    expect(within(ui.container).getByText('+ New quotation')).toBeTruthy();
  });
  it('Sales Employee: edit, duplicate, new — but no Delete', async () => {
    await mount('salesemp'); const c = cardOf('NK Industries');
    expect(btn(c, 'Edit')).toBeTruthy(); expect(btn(c, 'Duplicate')).toBeTruthy(); expect(btn(c, 'Delete')).toBeNull();
  });
  it('Inventory Manager (read): can Open only', async () => {
    await mount('inventory'); const c = cardOf('NK Industries');
    expect(btn(c, 'Open')).toBeTruthy();
    for (const b of ['Edit', 'Duplicate', 'Delete']) expect(btn(c, b)).toBeNull();
    expect(within(ui.container).queryByText('+ New quotation')).toBeNull();
  });
  it('Lead Filler: no access message', async () => {
    await mount('leadfiller');
    expect(ui.container.textContent).toContain("doesn't have access");
  });
});

// ---------- randomised UI flows, checked against the server ----------
let seed = Number(process.env.SEED) || 77;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['Alpha', 'பேனல்', 'Line1\nLine2', '  spaced  ', '₹ 1,200', '<b>x</b>', 'Ünïcode', '12.5', 'abc', '', '0', '99999'];
const TEXTK = ['ref', 'date', 'proj', 'delivery', 'pay', 'valid', 'warr', 'hsn', 'uom', 'bomLabel', 'disc', 'co', 'gstin'];
const MULTI = ['addr', 'note', 'kind', 'bank', 'coAddr', 'coContact', 'thanks', 'support'];
const MAX = { ref: 300, date: 300, proj: 300, delivery: 300, pay: 300, valid: 300, warr: 300, cust: 300, addr: 600, note: 600, kind: 600, bank: 800, co: 120, coAddr: 300, coContact: 300, gstin: 40, hsn: 12, uom: 20, disc: 200, bomLabel: 40, thanks: 300, support: 300 };
const parseNum = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
const nn = (v, f = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : f; };
const norm = (k, v) => String(v).replace(/\u00a0/g, ' ').trim();

describe('randomised UI flows', () => {
  it(`runs ${process.env.FLOWS || 800} random edit flows and every saved result matches the expectation`, async () => {
    const FLOWS = Number(process.env.FLOWS) || 800;
    let done = 0; const problems = [];
    await mount('admin');
    for (let f = 0; f < FLOWS; f++) {
      if (f % 40 === 0 && f) { cleanup(); await fetch(`${BASE}/__reset`, { method: 'POST' }); await mount(pick(['admin', 'saleshead', 'salesemp'])); }
      const mode = pick(['list', 'list', 'search', 'open', 'new']);
      let target = null; let before;
      const all = await list();
      if (mode === 'new') {
        click(within(ui.container).getByText('+ New quotation')); await waitFor(() => expect(field('cust')).toBeTruthy());
      } else {
        target = pick(all); before = JSON.parse(JSON.stringify(target));
        const words = target.ref.toLowerCase().split(/\s+/).filter(Boolean);
        const hits = words.length ? all.filter((q) => words.every((w) => [q.proj, q.cust, q.ref, q.addr].join(' ').toLowerCase().includes(w))) : [];
        const useMode = mode === 'search' && (hits.length !== 1 || /[\r\n]/.test(target.ref)) ? 'list' : mode; // search only when it finds exactly this record
        if (useMode === 'search') {
          fireEvent.change(ui.container.querySelector('.sp-search input'), { target: { value: target.ref } });
          await waitFor(() => expect(ui.container.querySelectorAll('.pq-result').length).toBe(1));
          click(btn(ui.container.querySelector('.pq-result'), 'Edit'));
        } else {
          const c = cards()[all.findIndex((q) => q.id === target.id)]; // cards are in id order, same as the API list
          if (useMode === 'open') { click(btn(c, 'Open')); await waitFor(() => expect(ui.container.querySelector('.pq-pdf')).toBeTruthy()); click(within(ui.container).getByText('Edit', { selector: 'button' })); }
          else click(btn(c, 'Edit'));
        }
        await waitFor(() => expect(field('cust')).toBeTruthy());
      }
      // random edits; keep an expectation of what the sheet then contains
      const exp = {}; let itemsNow = [...ui.container.querySelectorAll('[data-i][data-f="d"]')].map((_, n) => ({ d: cell(n, 'd').textContent, q: cell(n, 'q').textContent, u: cell(n, 'u').textContent, h: cell(n, 'h').textContent }));
      const steps = 1 + Math.floor(rnd() * 8);
      for (let s = 0; s < steps; s++) {
        const a = pick(['text', 'text', 'multi', 'num', 'cust', 'addrow', 'delrow', 'cell', 'cell', 'move', 'insert']);
        if (a === 'text') { const k = pick(TEXTK); const v = pick(WORDS) + (rnd() < 0.1 ? 'x'.repeat(700) : ''); if (field(k)) type(field(k), v); }
        else if (a === 'multi') { const k = pick(MULTI); if (field(k)) type(field(k), pick(WORDS) + '\n' + pick(WORDS)); }
        else if (a === 'num') { const k = pick(['price', 'gst', 'qty']); type(field(k), pick(['1000', '12.5', '0', 'abc', '₹ 2,500', '18', ''])); }
        else if (a === 'cust') { type(field('cust'), pick(['Zed Corp', ' Padded Co ', 'Üni Çorp', 'Customer ' + Math.floor(rnd() * 99)])); }
        else if (a === 'addrow') { click(within(ui.container).getByText('+ Add item')); }
        else if (a === 'delrow') { const b = ui.container.querySelectorAll('button[title="Remove row"]'); if (b.length) click(pick([...b])); }
        else if (a === 'move') { const b = [...ui.container.querySelectorAll(`button[title="${pick(['Move up', 'Move down'])}"]`)].filter((x) => !x.disabled); if (b.length) click(pick(b)); }
        else if (a === 'insert') { const b = ui.container.querySelectorAll('button[title="Insert row below"]'); if (b.length) click(pick([...b])); }
        else if (a === 'cell') { const n = rows(); if (n) { const i = Math.floor(rnd() * n); const ff = pick(['d', 'd', 'q', 'u', 'h']); type(cell(i, ff), pick(['PLC 1200', 'VFD', '3', '2.5', '', 'abc', 'm', '8536'])); } }
        await waitFor(() => expect(ui.container.querySelector('[data-k="cust"]')).toBeTruthy());
      }
      // what the sheet shows right now is what must be saved
      const shown = {}; ui.container.querySelectorAll('[data-k]').forEach((e) => { shown[e.dataset.k] = e.textContent.replace(/\u00a0/g, ' ').trim(); });
      const shownItems = []; const n = rows();
      for (let i = 0; i < n; i++) shownItems.push({ d: cell(i, 'd').textContent.trim(), q: parseFloat(cell(i, 'q').textContent) || 0, u: cell(i, 'u').textContent.trim(), h: cell(i, 'h').textContent.trim() });
      const willSave = rnd() < 0.8; const cancel = !willSave;
      if (cancel) {
        click(within(ui.container).getByText('Cancel'));
        await waitFor(() => expect(field('cust')).toBeNull().constructor);
        const after = await list();
        if (mode === 'new') { if (after.length !== all.length) problems.push(`flow ${f}: cancelled new quotation was stored`); }
        else if (JSON.stringify(after.find((q) => q.id === target.id)) !== JSON.stringify(before)) problems.push(`flow ${f}: cancel changed stored data`);
        if (mode === 'new' || mode === 'open') { /* back to list or sheet */ }
        // return to the list view for the next flow
        const back = within(ui.container).queryByText('‹ Back to List'); if (back) click(back);
        const inp = ui.container.querySelector('.sp-search input'); if (inp && inp.value) fireEvent.change(inp, { target: { value: '' } });
        done++; continue;
      }
      if (!shown.cust) {
        click(within(ui.container).getByText('Save changes'));
        await waitFor(() => expect(notify).toHaveBeenLastCalledWith('Customer is required', 'error'));
        if ((await list()).length !== all.length) problems.push(`flow ${f}: saved without customer`);
        click(within(ui.container).getByText('Cancel'));
      } else {
        click(within(ui.container).getByText('Save changes'));
        await waitFor(isSaved);
        const after = await list();
        const saved = mode === 'new' ? after.find((q) => !all.some((a) => a.id === q.id)) : after.find((q) => q.id === target.id);
        if (!saved) problems.push(`flow ${f}: saved record missing`);
        else {
          for (const [k, v] of Object.entries(shown)) {
            let e;
            if (['price', 'gst'].includes(k)) e = nn(parseNum(v));
            else if (k === 'qty') e = nn(parseNum(v), 1);
            else e = v.replace(/\r/g, '').slice(0, MAX[k] ?? 300);
            if (saved[k] !== e) problems.push(`flow ${f} (${mode}): field ${k} saved ${JSON.stringify(saved[k])} expected ${JSON.stringify(e)}`);
          }
          const ei = shownItems.filter((i) => i.d).slice(0, 300).map((i) => ({ d: i.d.slice(0, 300), q: nn(i.q), u: (i.u || 'Nos').slice(0, 20), h: i.h.slice(0, 12) }));
          if (JSON.stringify(sk(saved.items)) !== JSON.stringify(sk(ei))) problems.push(`flow ${f} (${mode}): items saved ${JSON.stringify(sk(saved.items)).slice(0, 160)} expected ${JSON.stringify(ei).slice(0, 160)}`);
          if (after.length !== all.length + (mode === 'new' ? 1 : 0)) problems.push(`flow ${f}: record count changed unexpectedly`);
        }
      }
      const back = within(ui.container).queryByText('‹ Back to List'); if (back) click(back);
      const inp = ui.container.querySelector('.sp-search input'); if (inp && inp.value) fireEvent.change(inp, { target: { value: '' } });
      done++;
    }
    console.log(`UI RANDOM FLOWS: ${done}/${FLOWS} completed, problems: ${problems.length}`);
    if (problems.length) console.log(problems.slice(0, 25).join('\n'));
    expect(problems).toEqual([]);
  });
});
