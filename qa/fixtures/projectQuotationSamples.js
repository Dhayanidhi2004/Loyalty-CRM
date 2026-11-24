// TEST FIXTURE ONLY (used by qa/). Not loaded by the app. Sample project quotations; seeded only when the
// project quotations table is empty. After that everything is edited from the CRM screen.
const { one, query } = require('../../server/src/db');

const SAMPLES = [
 {
  "ref": "LAP/OFF/26-27/0296",
  "date": "01-10-2026",
  "cust": "NK Industries",
  "addr": "Chennai.",
  "proj": "PLC Control Panel",
  "price": 106994,
  "gst": 18,
  "delivery": "1 Week from your confirmed PO",
  "valid": "1 week from the date of quotation",
  "warr": "1 year from the date of supply",
  "pay": "100% Advance",
  "note": "",
  "items": [
   {
    "d": "PLC: 8DI/6 DO (S71200-CPU1212C)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "VFD: 1-HP, 3-3 Ph",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Variac, 230 VAC, 15A",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Transformer Pri 230V, Sec 50V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Contactor: 9A, 24V DC",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Relay: 8 Ch, 1 CO, 24V DC",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "SMPS: 4.5A, 24VDC",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Control Contactor 24V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB 20A, 3P",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB 10A, 3P",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB 6A, 2P",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "CT Coil 100/5",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Multispan Ammeter (96x48)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Multispan Voltmeter (96x48)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Green PB without illumination",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Red PB without illumination",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "E-Stop",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "3 Way Selector Switch",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Yellow PB without illumination",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Blue PB without illumination",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Potentiometer",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Enclosure: H800*W600*D300",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Fan & Filter - 4 Inches",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Electrical Accessories",
    "q": 1,
    "u": "Acc",
    "h": "9987"
   },
   {
    "d": "Panel Wiring",
    "q": 1,
    "u": "Chrg",
    "h": "9987"
   }
  ]
 },
 {
  "ref": "LAP/OFF/26-27/0262",
  "date": "11-09-2026",
  "cust": "NK Industries",
  "addr": "Chennai - 600124",
  "proj": "Spin Coating Machine Electrical Panel",
  "price": 170400,
  "gst": 18,
  "delivery": "1-2 weeks from your confirmed PO",
  "valid": "1 week from the date of quotation",
  "warr": "1 year from the date of supply",
  "pay": "100% Advance",
  "note": "",
  "items": [
   {
    "d": "Panel 100(H) 700(W) 300(D)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Control Panel 300(H) 300(W) 250(D)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCCB 125A 3 Pole with Rotary handle",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Control Transformer 500VA, incoming 2PH 400VAC, Output 230VAC",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "3 Pole MPCB 1.6 to 2.4A",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "R,Y,B Indicator 230VAC",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Red Indicator",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Yellow Indicator",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Blue Indicator",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "E-Stop (XB4BT842)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Pot Meter",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "6A SMPS 24V Dinrail Mount",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "8 Ch Relay Module",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "DVP14SS211R",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "DVP16SP11R",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "6 Digit Counter 230V 36x72 (CT-3000)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "2 Way Selector Switch",
    "q": 4,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "4 Inch Fan & Filter",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Delta MS300 460V, 1.5KW/2HP (VFD4A2MS43ANSAA)",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Electrical Accessories",
    "q": 1,
    "u": "Chrg",
    "h": "9987"
   },
   {
    "d": "Wiring Charges",
    "q": 1,
    "u": "Chrg",
    "h": "9987"
   }
  ]
 },
 {
  "ref": "LAP/OFF/26-27/0242",
  "date": "10-09-2026",
  "cust": "Rambal Private Limited",
  "addr": "Sriperumbudur - 602105",
  "proj": "Polishing Machine",
  "price": 155000,
  "gst": 18,
  "delivery": "1-2 weeks from your confirmed PO",
  "valid": "1 week from the date of quotation",
  "warr": "1 year from the date of supply",
  "pay": "100% Advance",
  "note": "",
  "items": [
   {
    "d": "PLC: 16 DI; 12 DO R, 24 V DC",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "HMI: 7\"",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "5HP Drive (MS300)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB/16A/3P",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB/6A/1P",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "SMPS: 6A, 24V DINRAIL",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "E-STOP",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "32A Rotary Switch 3P ON-OFF",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Red Indicator 230V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Yellow Indicator 230V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Blue Indicator 230V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "2 Way S/S",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Relay Module 8CH/24V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "12A Contactor",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "3 HP OLR",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Control Transformer PRI-415V SEC-220V 250VA",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Green PB with Illum 230V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Red PB with Illum 230V",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "2.5 N TB",
    "q": 50,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "1.5 SQ MM Wire Red",
    "q": 10,
    "u": "Mtrs",
    "h": "8536"
   },
   {
    "d": "1.5 SQ MM Wire Yellow",
    "q": 10,
    "u": "Mtrs",
    "h": "8536"
   },
   {
    "d": "1.5 SQ MM Wire Blue",
    "q": 10,
    "u": "Mtrs",
    "h": "8536"
   },
   {
    "d": "0.5 SQ MM Wire",
    "q": 2,
    "u": "Coil",
    "h": "8536"
   },
   {
    "d": "4\" Fan/230V with Filter",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Panel Lamp 1 Feet",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Enclosure 800*600*300",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Operator Panel 300*300*100",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Electrical Accessories",
    "q": 1,
    "u": "Set",
    "h": "8536"
   },
   {
    "d": "Programming and Field Wiring",
    "q": 1,
    "u": "Chrg",
    "h": "9987"
   },
   {
    "d": "Panel Wiring Charges",
    "q": 1,
    "u": "Chrg",
    "h": "9987"
   }
  ]
 },
 {
  "ref": "LAP/OFF/26-27/0213",
  "date": "13-08-2026",
  "cust": "LNT Construction",
  "addr": "Chennai.",
  "proj": "Local Control Panel",
  "price": 0,
  "gst": 18,
  "delivery": "",
  "valid": "1 week from the date of quotation",
  "warr": "1 year from the date of supply",
  "pay": "100% Advance",
  "note": "Field Commissioning Charges will be Extra",
  "items": [
   {
    "d": "Panel H800 x W600 x D300",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB 4 pole/32A",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB 2 pole/6A",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MCB 1 pole/10A",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MPCB 9-14A",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "MPCB 1.6-2.5",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Add on for MPCB",
    "q": 4,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "SMPS S8VK-C24024",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Contactor 9A/24V DC coil",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Contactor 32A/24V DC coil",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Control Relay 4P 24VDC Coil",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "VFD ATV320U55N4C",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Dynamic Braking Resistor",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Relay PYFZ-08 & MY2N",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Relay PYFZ-14 & MY4N",
    "q": 4,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Indication lamp 24V DC (G)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Indication lamp 24V DC (R)",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Emergency stop",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "PVC Gland",
    "q": 1,
    "u": "Set",
    "h": "8536"
   },
   {
    "d": "PVC Duct",
    "q": 3,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "DIN Rail",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "TB 10 Sq.mm Grey",
    "q": 4,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "USLKG 10",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "TB 2.5 Sq.mm Grey",
    "q": 65,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "USLKG 2.5",
    "q": 20,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "End Cover 10 Sq.mm",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "End Cover 2.5 Sq.mm",
    "q": 20,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Cooling Fan 4\"",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Panel Filter 4\"",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Panel Stand",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Rotating Beacon",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Rectangular Male connector 16 Pin/16A IP65",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Rectangular Female connector 16 Pin/16A IP65",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Pendant Station: 4 PB",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "4 sqmm black cable",
    "q": 1,
    "u": "Coil",
    "h": "8536"
   },
   {
    "d": "2.5 sqmm black cable",
    "q": 40,
    "u": "Mtr",
    "h": "8536"
   },
   {
    "d": "0.75 Sqmm Black",
    "q": 1,
    "u": "Coil",
    "h": "8536"
   },
   {
    "d": "0.75 Sqmm Blue",
    "q": 1,
    "u": "Coil",
    "h": "8536"
   },
   {
    "d": "0.75 Sqmm Red",
    "q": 1,
    "u": "Coil",
    "h": "8536"
   },
   {
    "d": "0.75 Sqmm White",
    "q": 1,
    "u": "Coil",
    "h": "8536"
   },
   {
    "d": "Door switch",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Panel lamp",
    "q": 1,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Short link 2.5 sqmm",
    "q": 2,
    "u": "Nos",
    "h": "8536"
   },
   {
    "d": "Panel Accessories",
    "q": 1,
    "u": "Set",
    "h": "8536"
   },
   {
    "d": "Panel Wiring",
    "q": 1,
    "u": "Set",
    "h": "8536"
   }
  ]
 }
];

async function seedProjectQuotations() {
  const row = await one('select count(*)::int as n from crm_project_quotations');
  if (row.n > 0) return;
  for (const q of SAMPLES) await query('insert into crm_project_quotations (data) values ($1)', [JSON.stringify(q)]);
  console.log(`Seeded ${SAMPLES.length} sample project quotations`);
}

module.exports = { SAMPLES, seedProjectQuotations };
