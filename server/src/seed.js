// ensureAdmin() runs on every server start: creates the first admin if none exists.
// `npm run seed` additionally loads one demo employee per login role and sample records.
require('dotenv').config();
const bcrypt = require('bcryptjs');

async function ensureAdmin() {
  const { one } = require('./db');
  const existing = await one("select id from crm_users where role = 'admin' limit 1");
  if (existing) return;
  const email = process.env.ADMIN_EMAIL || 'admin@crm.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  await one(
    `insert into crm_users (name, email, password_hash, role, designation, emp_code)
     values ('Admin', $1, $2, 'admin', 'Administrator', $3)
     on conflict do nothing returning id`,
    [email, await bcrypt.hash(password, 10), `LOY-${100000 + Math.floor(Math.random() * 900000)}`]
  );
  console.log(`Created admin account -> ${email} / ${password}  (change it after first login)`);
}

const daysAgo = (n, hour = 11) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
  return d.toISOString();
};
const ymd = (n) => daysAgo(n).slice(0, 10);
const pick = (arr, i) => arr[i % arr.length];
const r2 = (n) => Math.round(n * 100) / 100;

async function seedDemo() {
  const { one, query, tx, initSchema, pool } = require('./db');
  const { financialYear } = require('./utils');
  await initSchema();
  await ensureAdmin();

  // one demo login per role (password: employee123)
  const team = [
    { key: 'salesHead', name: 'Karthik Raja', email: 'saleshead@crm.com', role: 'Sales Head', phone: '9840012345', code: 'LOY-660695' },
    { key: 'sales1', name: 'Divya Lakshmi', email: 'sales@crm.com', role: 'Sales Employee', phone: '9840023456', code: 'LOY-296847' },
    { key: 'sales2', name: 'Priya Sundar', email: 'priya@crm.com', role: 'Sales Employee', phone: '9840045678', code: 'LOY-835554' },
    { key: 'service', name: 'Arun Kumar', email: 'service@crm.com', role: 'Service Engineer', phone: '9840034567', code: 'LOY-325332' },
    { key: 'engineer', name: 'Vignesh M', email: 'engineer@crm.com', role: 'Engineer', phone: '9840056789', code: 'LOY-771778' },
    { key: 'inventory', name: 'Meena R', email: 'inventory@crm.com', role: 'Inventory Manager', phone: '9840067890', code: 'LOY-927359' },
    { key: 'leadFiller', name: 'Sathish K', email: 'leads@crm.com', role: 'Lead Filler', phone: '9840078901', code: 'LOY-412208' },
    { key: 'stockFiller', name: 'Ganesh P', email: 'stock@crm.com', role: 'Stock Filler', phone: '9840089012', code: 'LOY-325210' },
  ];
  const resourcesFor = {
    sales1: [{ name: 'Laptop', code: '#PD12', endDate: ymd(-200), status: 'provided' }],
    service: [{ name: 'Laptop', code: '#PD07', endDate: ymd(-150), status: 'provided' }, { name: 'Tool Kit', code: '#TK03', endDate: null, status: 'provided' }],
    salesHead: [{ name: 'SIM Card', code: '#SIM44', endDate: null, status: 'provided' }],
    engineer: [{ name: 'Bike', code: 'TN09 AB 1234', endDate: ymd(20), status: 'returned' }],
  };
  const hash = await bcrypt.hash('employee123', 10);
  const id = {};
  for (const [i, e] of team.entries()) {
    const row = await one(
      `insert into crm_users (name, email, password_hash, role, phone, designation, joining_date, address, salary, resources, emp_code)
       values ($1,$2,$3,'employee',$4,$5,$6,'Chennai, Tamil Nadu',$7,$8,$9)
       on conflict (lower(email)) do update set name = excluded.name returning id`,
      [e.name, e.email, hash, e.phone, e.role, ymd(400 - i * 40), 22000 + i * 3500, JSON.stringify(resourcesFor[e.key] || []), e.code]
    );
    id[e.key] = row.id;
  }

  const { rows } = await query('select count(*)::int as n from crm_records');
  if (rows[0].n > 0) {
    console.log('Records already exist — skipped sample data. Demo logins are in place.');
    await pool.end();
    return;
  }

  const fy = financialYear();
  const prefix = process.env.DOC_PREFIX || 'LAP';
  const sales = [id.sales1, id.sales2, id.salesHead];
  const records = [];
  const push = (module, data, status, by, at, statusAt) => records.push({ module, data, status, by, at, statusAt: statusAt ?? (status ? at : null) });

  const customers = [
    ['Sri Murugan Textiles', 'Ramesh S', '9876501234', 'Coimbatore'],
    ['Annai Supermarket', 'Selvi K', '9876502345', 'Chennai'],
    ['Kaveri Hardware', 'Mohan P', '9876503456', 'Trichy'],
    ['Lotus Pharma', 'Anitha V', '9876504567', 'Madurai'],
    ['Royal Bakery', 'Imran A', '9876505678', 'Chennai'],
    ['Green Leaf Restaurant', 'Suresh N', '9876506789', 'Salem'],
    ['Ganesh Electricals', 'Bala G', '9876507890', 'Vellore'],
    ['Star Mobiles', 'Farhan T', '9876508901', 'Chennai'],
  ];
  const products = ['PLC Controller', 'VFD Drive', 'HMI Panel', 'Servo Motor', 'Proximity Sensor', 'SMPS 24V', 'Contactor'];
  const sources = ['Phone Call', 'Email', 'WhatsApp', 'Walk-in', 'Website', 'Reference', 'Exhibition'];
  const gstNo = (n) => `33AAB${'CDEFG'[n % 5]}${1000 + n * 37}K1Z${n}`;
  const panNo = (n) => `AAB${'CDEFG'[n % 5]}${1000 + n * 37}K`;

  customers.forEach(([company, person, phone, city], i) => {
    push('customers', { cusId: `CUS-${284100 + i * 7351}`, companyName: company, gst: gstNo(i), pan: panNo(i), contactPerson: person, phone, email: null, address: `${city}, Tamil Nadu` }, null, pick(sales, i), daysAgo(i * 3 + 1));
  });

  // ~45 enquiries over the last month across the pipeline (New Lead -> Assigned -> Quoted -> Closed)
  const leadCompanies = [
    ['DAVID Pvt Ltd', 'David', 'Dharmapuri'], ['Kumaraguru Mills', 'Sunil', 'Chennai'], ['KBT Service', 'Raju', 'Namakkal'],
    ['Dhaya Pvt', 'Dhayanidhi', 'Chennai'], ['ASPECT Pvt Ltd', 'Sunil', 'Coimbatore'], ['System Automation', 'Sitharath', 'Madurai'],
    ['Apex Robotics', 'Karthik', 'Hosur'], ['Chennai Sunday', 'Meena', 'Chennai'], ['JAMES Pvt Ltd', 'James', 'Trichy'],
    ['Royal Enfield Dealer', 'Vikram', 'Salem'], ['Wipro Facility', 'Anand', 'Chennai'], ['KTM Showroom', 'Prakash', 'Vellore'],
    ['Yamaha Service', 'Ganesh', 'Erode'], ['Lotus Pharma', 'Anitha', 'Madurai'], ['Green Leaf Foods', 'Suresh', 'Salem'],
  ];
  const states = { Hosur: 'Tamil Nadu' };
  const pins = { Dharmapuri: '636701', Chennai: '600032', Namakkal: '637001', Coimbatore: '641014', Madurai: '625001', Hosur: '635109', Trichy: '620001', Salem: '636004', Vellore: '632001', Erode: '638001' };
  const stagesCycle = ['New Lead', 'Assigned', 'Quoted', 'Closed: Won', 'Assigned', 'New Lead', 'Closed: Lost', 'Quoted', 'Assigned'];
  const priorities = ['Hot', 'High', 'Warm', 'Low', 'High', 'Warm'];
  const salesTeam = [id.sales1, id.sales2];
  for (let i = 0; i < 45; i++) {
    const [company, person, city] = leadCompanies[i % leadCompanies.length];
    const stage = i < 3 ? ['Closed: Won', 'Closed: Lost', 'Closed: Won'][i] : pick(stagesCycle, i);
    const age = i < 3 ? 0 : (i * 11 + (i % 3) * 7) % 30; // a few closed today for the "Today's" buttons
    const assigned = stage === 'New Lead' ? null : pick(salesTeam, i);
    const by = i % 4 === 0 ? id.leadFiller : i % 4 === 1 ? id.salesHead : pick(salesTeam, i);
    push('leads', {
      enqNo: `ENQ-${830110 - i * 13729}`, companyName: company, customerName: person, phone: `9${String(800000000 + i * 7654321).slice(0, 9)}`,
      email: `${person.toLowerCase()}@${company.split(' ')[0].toLowerCase()}.in`, city, state: states[city] || 'Tamil Nadu',
      category: i % 5 === 3 ? 'Service' : 'Product', priority: pick(priorities, i), source: pick(sources, i * 3 + 1),
      product: pick(products, i), requirement: `Needs ${pick(products, i)} for ${company}`, assignedTo: assigned,
      followUpDate: ymd(-2 - (i % 7)), remarks: null,
      department: pick(['Purchase', 'Maintenance', 'Production', 'Projects', 'Admin'], i),
      condition: pick(['New Customer', 'Existing Customer', 'Repeat Order', 'Follow-up', 'New Customer'], i),
      altPhone: i % 3 === 0 ? `9${String(700000000 + i * 3456789).slice(0, 9)}` : null,
      address: `${12 + i}, ${pick(['Industrial Estate', 'Main Road', 'SIDCO Estate', 'Bypass Road'], i)}`,
      country: 'India', postalCode: pins[city] || '600001', salesHead: id.salesHead,
    }, stage, by, daysAgo(age, 10), daysAgo(age, 15));
  }

  customers.slice(0, 5).forEach(([company, person], i) => {
    push('quotationRequests', { customerName: person, companyName: company, product: pick(products, i + 1), quantity: i + 1, specification: null, requiredBy: ymd(-7) }, pick(['Pending', 'In Progress', 'Approved'], i), pick(sales, i), daysAgo(i + 1));
  });

  // Purchase orders
  const poLines = [
    [['HNC', 'U89G', 'PLC', 13, 5560]],
    [['8537', 'HMI 7 inch', 'Nos', 2, 18000], ['8504', 'SMPS 24V 5A', 'Nos', 4, 1450]],
    [['8501', 'Servo Motor 750W', 'Nos', 1, 32000]],
    [['8536', 'Contactor 32A', 'Nos', 10, 1200], ['8544', 'Control cable 100m', 'Roll', 2, 5400]],
  ];
  const terms = [
    ['100% against delivery', '100% against proforma Invoice', '30 days PDC'],
    ['50% advance, 50% on delivery', '1 Year from the date of supply', 'Within 7 working days'],
    ['Advance payment', '6 months', 'Ex-stock'],
  ];
  customers.slice(0, 5).forEach(([company, , , city], i) => {
    const prods = poLines[i % poLines.length].map(([hsnCode, unitDescription, uom, quantity, unitPrice]) => ({ hsnCode, unitDescription, description: `${unitDescription} for ${company}`, uom, quantity, unitPrice, amount: quantity * unitPrice }));
    const totalAmount = prods.reduce((t, p) => t + p.amount, 0);
    const gstAmount = r2(totalAmount * 0.18);
    const [paymentTerms, warrantyTerms, deliveryTerms] = terms[i % terms.length];
    push('poRequests', {
      companyName: company, docNumber: `${prefix}/PO/${fy}/${String(5 - i).padStart(3, '0')}`, paymentTerms, warrantyTerms, deliveryTerms, gst: 18,
      financialYear: fy, refQNo: `${prefix}/OFF/${fy}/${20 + i}`,
      products: prods, discount: null, lp: String(6500 + i * 250), address: city, suppNo: `SUP-${328600 + i * 1111}`, gstin: gstNo(i), qDate: ymd(i + 20),
      totalAmount, gstAmount, payableAmount: r2(totalAmount + gstAmount),
    }, null, pick(sales, i), daysAgo(i * 2));
  });

  // Proforma invoices (subtotal = items − discount% + freight; GST on subtotal; rounded)
  customers.slice(0, 4).forEach(([, person, phone, city], i) => {
    const items = [{ itemName: pick(products, i), unitDescription: 'As per datasheet', uom: 'Nos', quantity: i + 1, unitPrice: 1000 * (i + 1), total: (i + 1) * 1000 * (i + 1) }];
    if (i % 2) items.push({ itemName: 'Installation charges', unitDescription: 'On site', uom: 'Lot', quantity: 1, unitPrice: 1500, total: 1500 });
    const itemsTotal = items.reduce((t, x) => t + x.total, 0);
    const freight = 100 * (i + 1);
    const subtotal = itemsTotal + freight;
    const gstAmount = r2(subtotal * 0.18);
    const exact = r2(subtotal + gstAmount);
    push('pi', {
      piNumber: `${prefix}/PI/${fy}/${String(42 - i).padStart(4, '0')}`, piId: `Pi-${(0x85b15671 + i * 7777).toString(16)}`, customerName: person, address: city, phone, gstin: gstNo(i),
      yourRef: String(12 + i), refDate: ymd(i + 3), piDate: ymd(i * 3), state: 'Tamil Nadu - 33',
      poNo: `${prefix}/PO/${fy}/${String(5 - i).padStart(3, '0')}`, poDate: ymd(i * 2), paymentTerms: pick(['100% advance', '30 days credit'], i), delivery: pick(['Ex-stock', '2 weeks'], i), jurisdiction: 'Chennai',
      discount: null, lpAmount: null, freight, gst: 18, certification: pick(['Yes', 'No'], i), goodsReturn: 'No', interestRate: 18,
      items, fy, itemsTotal, subtotal, gstAmount, roundOff: r2(Math.round(exact) - exact), totalPayable: Math.round(exact),
    }, pick(['POreq', 'Sent', 'Paid'], i), pick(sales, i), daysAgo(i * 3));
  });

  // Quotations (GST on items + freight + LP)
  customers.slice(0, 4).forEach(([, person], i) => {
    const prods = [{ description: pick(['HML', 'Panel', 'Drive', 'Sensor'], i), hsnCode: pick(['HSi', '8537', '8504', '9026'], i), unitDescription: pick(['PLX', 'HMI 7"', 'VFD 2HP', 'PNP 12mm'], i), uom: pick(['Kg', 'Nos', 'Nos', 'Nos'], i), quantity: pick([250, 2, 3, 20], i), unitPrice: pick([50, 18000, 14500, 650], i) }];
    prods.forEach((p) => { p.total = p.quantity * p.unitPrice; });
    const itemsTotal = prods.reduce((t, p) => t + p.total, 0);
    const gst = pick([17, 18, 18, 15], i);
    const gstAmount = r2((itemsTotal * gst) / 100);
    push('quotations', {
      enquiryNo: `ENQ-${pick([610711, 973824, 116822, 520406], i)}`, referenceNo: `${prefix}/OFF/${fy}/${28 - i * 2}`, customerName: person,
      paymentDue: pick(['60 days', '30 days'], i), validity: '1 week from the date of quotation.', warranty: '1 Year from the date of supply',
      delivery: pick(['Week', '1 week from date of PO'], i), discount: 'Discounted Price', gst, lpAmount: null, freight: null,
      products: prods, itemsTotal, gstAmount, totalPayable: r2(itemsTotal + gstAmount),
    }, pick(['quotsaccess', 'Sent', 'Accepted', 'Draft'], i), pick(sales, i), daysAgo(i * 2 + 1));
  });

  // Sales orders
  [['Prasanth', 'Confirmed', []], ['Ramesh S', 'Confirmed', [['VFD Drive', 2, 8000]]], ['Selvi K', 'Pending', [['HMI Panel', 1, 16000]]],
    ['Mohan P', 'Confirmed', [['Servo Motor', 1, 32000], ['SMPS 24V', 4, 1450]]], ['Anitha V', 'Dispatched', [['Contactor', 8, 1250]]], ['Imran A', 'Delivered', [['Proximity Sensor', 2, 650]]]]
    .forEach(([customer, status, lines], i) => {
      const items = lines.map(([itemName, quantity, unitPrice]) => ({ itemName, quantity, unitPrice, total: r2(quantity * unitPrice) }));
      const grandTotal = r2(items.reduce((t, x) => t + x.total, 0) * 1.18);
      push('salesOrders', { orderId: `ORD-${pick([316, 936, 246, 726, 709, 734], i)}`, customer, orderDate: ymd(i * 2), deliveryDate: ymd(i * 2 - 7), gst: 18, items, remarks: null, grandTotal }, status, pick(sales, i), daysAgo(i * 2));
    });

  // Product requests (engineers)
  [['Workafella', 'Sathiswarri M', 'david@gmail.com', 'Need replacement switches for the panel', [['Switch', 56]]],
    ['Workafella', 'Anirudh', 'anirudh@workafella.com', 'Stock for AMC visit', [['Switch', 100], ['Indicator lamp', 20]]],
    ['Klenty', 'Malini', 'malini@klenty.com', 'Urgent – breakdown', [['Switch', 110]]],
    ['Lotus Pharma', 'Anitha V', 'anitha@lotus.in', 'Sensor upgrade', [['Proximity Sensor', 12]]]]
    .forEach(([company, contactPerson, email, description, lines], i) => {
      push('productRequests', { email, company, contactPerson, description, products: lines.map(([name, quantity]) => ({ name, quantity })) },
        pick(['products-status', 'Pending', 'Approved', 'Delivered'], i), pick([id.service, id.engineer], i), daysAgo(i));
    });

  // Work visits -> "Service Engineers"
  [['Workafella', 'Lathe Machine', 'Spindle vibration at high RPM', 'Reprogram the drive', null],
    ['Workafella', 'CNC Router', 'Panel wiring check', 'Loose earth connection', 'Fixed and tested'],
    ['Klenty', 'Packing Machine', 'Product damaged heavily', 'No problem', null],
    ['Kaveri Hardware', 'Air Compressor', 'Pressure switch replacement', 'Switch failing to cut off', 'Replaced pressure switch'],
    ['Royal Bakery', 'Dough Mixer', 'Motor overheating', 'Bearing worn out', null]]
    .forEach(([company, machine, productDescription, complaints, assessment], i) => {
      push('workVisits', { company, visitDate: ymd(i), machine, productDescription, complaints, assessment }, null, pick([id.service, id.engineer], i), daysAgo(i));
    });

  // Service details
  [['Anirudh', 'LOY-771778', 'hutdred', 56, 'Switch', 'ACbb', '63566796', '67 W', 'In Progress', 'Pending'],
    ['Schneider', 'LOY-835554', '4thLOY', 110, 'Drive', 'LOY-007', '63566797', '1.5 kW', 'Completed', 'Done'],
    ['Klenty', 'LOY-771778', '4thLOY', 1550, 'Switch', 'SCHM', '63566798', '45 W', 'Completed', 'Done'],
    ['Lotus Pharma', 'LOY-660695', 'INW-221', 4, 'Sensor', 'PNP-12', '63566799', '3 W', 'Pending', 'Pending']]
    .forEach(([client, eid, customerInward, quantity, material, model, serialNo, powerConsumption, serviceStatus, billingStatus], i) => {
      push('serviceDetails', { client, eid, customerInward, quantity, material, model, serialNo, powerConsumption, serviceStart: ymd(i * 5 + 6), serviceEnd: ymd(i * 5), serviceStatus, billingStatus },
        null, pick([id.service, id.engineer], i), daysAgo(i * 5));
    });

  // inventory: current = inward − outward
  [
    ['PLC-S7-1200', 'S7-1200 CPU 1214C', 'Siemens', 'PLC controller', 12000, 30, 5, 5],
    ['VFD-ATV12-2HP', 'ATV12 2HP', 'Schneider', 'VFD drive', 14500, 10, 6, 5],
    ['HMI-KTP700', 'KTP700 Basic 7"', 'Siemens', 'HMI panel', 18000, 15, 3, 3],
    ['PX-E2E-12', 'E2E-X5ME1', 'Omron', 'Proximity sensor 12mm', 650, 20, 18, 10],
    ['CT-LC1D32', 'LC1D32', 'Schneider', 'Contactor 32A', 1200, 25, 7, 5],
    ['PS-S8VK-24', 'S8VK-G12024', 'Omron', 'SMPS 24V 5A', 1450, 12, 5, 2],
    ['CBL-CTRL-100', '0.75 sqmm x 12C', 'Polycab', 'Control cable 100 m roll', 5400, 50, 10, 10],
  ].forEach(([itemCode, model, brand, description, price, inward, outward, minStock], i) =>
    push('inventory', { itemCode, model, brand, description, price, inward, outward, current: inward - outward, minStock, location: 'Main Godown' }, null, id.stockFiller, daysAgo(30 - i))
  );

  await tx(async (client) => {
    for (const r of records) {
      await client.query(
        'insert into crm_records (module, data, status, created_by, created_at, updated_at, status_changed_at) values ($1,$2,$3,$4,$5,$5,$6)',
        [r.module, r.data, r.status, r.by, r.at, r.statusAt]
      );
    }
    for (const [code, value] of [['PO', 5], ['PI', 42], ['OFF', 28]]) {
      await client.query('insert into crm_counters (name, value) values ($1, $2) on conflict (name) do update set value = greatest(crm_counters.value, $2)', [`${code}/${fy}`, value]);
    }
  });

  console.log(`Seeded ${team.length} demo logins (password: employee123) and ${records.length} sample records.`);
  console.log(team.map((t) => `  ${t.role.padEnd(18)} ${t.email}`).join('\n'));
  await pool.end();
}

if (require.main === module) {
  seedDemo().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { ensureAdmin };
