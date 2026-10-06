// Sample inbox used when GMAIL_MOCK=1 (try the Email Leads page without a Google account).
// Mixes real-looking enquiries with mail the scanner should ignore.
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

module.exports = () => [
  {
    id: 'mock-001', threadId: 'mock-001', receivedAt: hoursAgo(2),
    fromName: 'Ravi Kumar', fromEmail: 'ravi.kumar@sripumps.in', listUnsubscribe: false,
    subject: 'Request for quotation - 3 HP monoblock pumps',
    snippet: 'Kindly send your best price for 12 nos of 3 HP monoblock pumps…',
    body: `Dear Sir,

We have a requirement for 12 nos of 3 HP monoblock pumps for our new plant in Coimbatore.
Kindly send your best price and delivery schedule at the earliest.

Regards,
Ravi Kumar
Purchase Manager
Sri Pumps Pvt Ltd
+91 98430 22118`,
  },
  {
    id: 'mock-002', threadId: 'mock-002', receivedAt: hoursAgo(6),
    fromName: 'Anitha S', fromEmail: 'maintenance@kavyatextiles.com', listUnsubscribe: false,
    subject: 'Compressor breakdown - service needed urgently',
    snippet: 'Our air compressor stopped working this morning…',
    body: `Hello team,

Our air compressor (model AC-55) stopped working this morning and production is affected.
We need a service engineer urgently. Please call me on 0422-2456789 or 97890 11223.

Thanks,
Anitha S
Kavya Textiles
Tiruppur`,
  },
  {
    id: 'mock-003', threadId: 'mock-003', receivedAt: hoursAgo(26),
    fromName: 'Prakash Menon', fromEmail: 'prakash.menon1984@gmail.com', listUnsubscribe: false,
    subject: 'Enquiry about control panels',
    snippet: 'I am looking for a supplier for PLC control panels…',
    body: `Hi,

I am looking for a supplier for PLC control panels for 4 machines. Please share your catalogue and price list.
We are based in Kochi.

Prakash Menon
Menon Engineering Works
Mobile: 9447012345`,
  },
  {
    id: 'mock-004', threadId: 'mock-004', receivedAt: hoursAgo(30),
    fromName: 'TechWorld Weekly', fromEmail: 'newsletter@techworld-weekly.com', listUnsubscribe: true,
    subject: 'This week: 10 automation trends + webinar invite',
    snippet: 'Join our free webinar on factory automation…',
    body: 'Join our free webinar on factory automation. Best price on tickets this week only! Click here to unsubscribe.',
  },
  {
    id: 'mock-005', threadId: 'mock-005', receivedAt: hoursAgo(40),
    fromName: 'Google', fromEmail: 'no-reply@accounts.google.com', listUnsubscribe: false,
    subject: 'Security alert',
    snippet: 'A new sign-in on Windows…',
    body: 'A new sign-in on Windows. If this was you, you don\'t need to do anything. Your verification code is 482913.',
  },
  {
    id: 'mock-006', threadId: 'mock-006', receivedAt: hoursAgo(50),
    fromName: 'Amazon.in', fromEmail: 'shipment-tracking@amazon.in', listUnsubscribe: true,
    subject: 'Your order has been shipped',
    snippet: 'Your order of 2 items has been shipped…',
    body: 'Your order of 2 items has been shipped and will be delivered by Friday. Order confirmation #402-1234567.',
  },
  {
    id: 'mock-007', threadId: 'mock-007', receivedAt: hoursAgo(75),
    fromName: 'Deepa R', fromEmail: 'deepa.r@greenfieldhospital.org', listUnsubscribe: false,
    subject: 'AMC for UPS systems',
    snippet: 'We are interested in an annual maintenance contract…',
    body: `Dear Sir/Madam,

We are interested in an AMC for 6 UPS systems at our Chennai campus. Please send a quotation with the scope of service.

Regards,
Deepa R
Biomedical Department
Greenfield Hospital
044 2815 6600`,
  },
];
