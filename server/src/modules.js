// Single source of truth for every CRM module.
// The frontend reads this via GET /api/modules and builds its forms from it,
// and each list screen shows the fields the original CRM shows.
//
// field types: text | email | tel | number | currency | date | textarea | select | file | items | employee
// suggestions: [...] -> free text with a suggestion list
// employee         -> stores a user id; employeeList: 'salesHeads' limits the choice to Sales Heads
// hidden: true     -> stored but not shown in forms
// section          -> heading the field sits under on the sectioned enquiry form (Lead Filler)
// table: true      -> shown as a column in table-style list pages
// required: true   -> validated on create/update
// formLabel        -> friendlier label in forms when the screen label is terse (e.g. "paymentTerms")
// autoNumber       -> filled in when left blank:
//     { style: 'fy', code: 'PO', pad: 3 }          -> LAP/PO/26-27/001   (sequence per financial year)
//     { style: 'random', code: 'CUS', digits: 6 }  -> CUS-482913         (unique within the module)
//     { style: 'hex', code: 'Pi' }                 -> Pi-85b15671
// computed: true   -> calculated by the server (see `totals`), never typed in
// type 'items'     -> list of line items; `columns` describes them and `lineTotal`
//                     says which column is quantity x price
// totals           -> which calculation the server runs on save (routes/records.js)

// Lead pipeline, as on the sales dashboard: New Lead -> Assigned -> Quoted -> Closed: Won / Closed: Lost.
// "Converted" everywhere in the CRM means Closed: Won, "Not Converted" means Closed: Lost.
const LEAD_STAGES = ['New Lead', 'Assigned', 'Quoted', 'Closed: Won', 'Closed: Lost'];
const CONVERTED = 'Closed: Won';
const NOT_CONVERTED = 'Closed: Lost';

const STATUS = {
  lead: LEAD_STAGES,
  request: ['Pending', 'In Progress', 'Approved', 'Rejected'],
};

const YES_NO = ['Yes', 'No'];

// Choices on the Create Purchase Order form (free text is accepted too)
const PAYMENT_TERMS = ['100% against delivery', '100% against proforma Invoice', '50% advance, 50% on delivery', 'Advance payment', '30 days PDC', '30 days credit', '45 days credit'];
const WARRANTY_TERMS = ['No warranty', '6 months', '1 Year from the date of supply', '18 months from the date of supply', '2 Years from the date of supply'];
const DELIVERY_TERMS = ['Ex-stock', 'Immediate', 'Within 7 working days', '2-3 weeks', '4-6 weeks'];

const modules = {
  leads: {
    label: 'Lead Enquiries',
    title: 'Lead Enquiry',
    singular: 'Lead Enquiry',
    statuses: STATUS.lead,
    employeeCanCreate: true,
    fields: [
      // Lead Details (as on the "Sales Head Enquiry" form)
      { key: 'enqNo', label: 'Enquiry No', type: 'text', autoNumber: { style: 'random', code: 'ENQ', digits: 6 } },
      { key: 'companyName', label: 'Company Name', type: 'text', required: true, table: true, section: 'Lead Details' },
      { key: 'customerName', label: 'Contact Person', type: 'text', required: true, table: true, section: 'Lead Details' },
      { key: 'department', label: 'Department', type: 'text', section: 'Lead Details' },
      { key: 'source', label: 'Lead Medium', type: 'text', suggestions: ['Phone Call', 'Email', 'WhatsApp', 'Walk-in', 'Website', 'Reference', 'Exhibition', 'Social Media'], table: true, section: 'Lead Details' },
      { key: 'priority', label: 'Lead Priority', type: 'select', options: ['Hot', 'High', 'Warm', 'Low'], table: true, section: 'Lead Details' },
      { key: 'category', label: 'Enquiry Type', type: 'select', options: ['Product', 'Service'], section: 'Lead Details' },
      { key: 'condition', label: 'Lead Condition', type: 'select', options: ['New Customer', 'Existing Customer', 'Repeat Order', 'Follow-up'], section: 'Lead Details' },
      // Contact Details
      { key: 'phone', label: 'Mobile Number', type: 'tel', required: true, table: true, section: 'Contact Details' },
      { key: 'altPhone', label: 'Alternate Mobile Number', type: 'tel', section: 'Contact Details' },
      { key: 'email', label: 'Email', type: 'email', section: 'Contact Details' },
      { key: 'altEmail', label: 'Alternate Email', type: 'email', section: 'Contact Details' },
      // Address Details
      { key: 'address', label: 'Address', type: 'text', section: 'Address Details' },
      { key: 'country', label: 'Country', type: 'text', section: 'Address Details' },
      { key: 'city', label: 'City', type: 'text', table: true, section: 'Address Details' },
      { key: 'postalCode', label: 'Postal Code', type: 'text', section: 'Address Details' },
      { key: 'state', label: 'State', type: 'text', section: 'Address Details' },
      // Additional Information
      { key: 'requirement', label: 'Description', type: 'textarea', section: 'Additional Information' },
      { key: 'salesHead', label: 'Sales Head', type: 'employee', formLabel: 'Sales Head ID', employeeList: 'salesHeads', section: 'Additional Information' },
      // worked by the sales team
      { key: 'product', label: 'Product / Service Interested', type: 'text' },
      { key: 'assignedTo', label: 'Assigned To', type: 'employee' },
      { key: 'followUpDate', label: 'Next Follow-up', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'emailLeadId', label: 'Email Lead', type: 'text', hidden: true },
    ],
  },

  // "Completed Enquiries"
  customers: {
    label: 'Customers',
    title: 'Completed Enquiries',
    singular: 'Customer',
    statuses: null,
    employeeCanCreate: true,
    fields: [
      { key: 'cusId', label: 'Cus ID', type: 'text', autoNumber: { style: 'random', code: 'CUS', digits: 6 }, table: true },
      { key: 'companyName', label: 'Company', type: 'text', required: true, table: true },
      { key: 'gst', label: 'GST', type: 'text', table: true },
      { key: 'pan', label: 'PAN', type: 'text', table: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Address', type: 'textarea' },
    ],
  },

  quotationRequests: {
    label: 'Quotation Requests',
    singular: 'Quotation Request',
    statuses: STATUS.request,
    employeeCanCreate: true,
    fields: [
      { key: 'customerName', label: 'Customer Name', type: 'text', required: true, table: true },
      { key: 'companyName', label: 'Company Name', type: 'text', table: true },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'product', label: 'Product', type: 'text', required: true, table: true },
      { key: 'quantity', label: 'Quantity', type: 'number', table: true },
      { key: 'specification', label: 'Specification', type: 'textarea' },
      { key: 'requiredBy', label: 'Required By', type: 'date', table: true },
    ],
  },

  // "Purchase Order Management" — card ID shows the creating employee's code (LOY-######)
  poRequests: {
    label: 'PO Requests',
    title: 'Purchase Order Management',
    singular: 'Purchase Order',
    statuses: null,
    employeeCanCreate: true,
    totals: 'po',
    fields: [
      { key: 'companyName', label: 'Company', formLabel: 'Customer Name', type: 'text', required: true },
      // PO number uses the Financial Year typed on the form (e.g. 26-27), else the current one
      { key: 'docNumber', label: 'PO Number', type: 'text', autoNumber: { style: 'fy', code: 'PO', pad: 3, fyField: 'financialYear' } },
      { key: 'paymentTerms', label: 'paymentTerms', formLabel: 'Payment Terms', type: 'text', suggestions: PAYMENT_TERMS },
      { key: 'warrantyTerms', label: 'warrantyTerms', formLabel: 'Warranty Terms', type: 'text', suggestions: WARRANTY_TERMS },
      { key: 'deliveryTerms', label: 'deliveryTerms', formLabel: 'Delivery Terms', type: 'text', suggestions: DELIVERY_TERMS },
      { key: 'financialYear', label: 'Financial Year', type: 'text' },
      { key: 'gst', label: 'gst', formLabel: 'GST %', type: 'number' },
      {
        key: 'products', label: 'Products', type: 'items',
        columns: [
          { key: 'hsnCode', label: 'hsnCode', formLabel: 'HSN Code', type: 'text' },
          { key: 'unitDescription', label: 'unitDescription', formLabel: 'Unit Description', type: 'text' },
          { key: 'description', label: 'description', formLabel: 'Description', type: 'text' },
          { key: 'uom', label: 'uom', formLabel: 'UOM', type: 'text' },
          { key: 'quantity', label: 'quantity', formLabel: 'Qty', type: 'number' },
          { key: 'unitPrice', label: 'unitPrice', formLabel: 'Unit Price', type: 'currency' },
          { key: 'amount', label: 'amount', formLabel: 'Amount', type: 'currency', computed: true },
        ],
        lineTotal: { key: 'amount', qty: 'quantity', price: 'unitPrice' },
      },
      { key: 'discount', label: 'discount', formLabel: 'Discount (₹)', type: 'currency' },
      { key: 'lp', label: 'LP', type: 'text' },
      { key: 'address', label: 'Address', formLabel: 'Address Details', type: 'textarea' },
      { key: 'refQNo', label: 'RefQNo', formLabel: 'Ref. Quotation No', type: 'text' },
      { key: 'suppNo', label: 'SuppNO', formLabel: 'Supplier No.', type: 'text', autoNumber: { style: 'random', code: 'SUP', digits: 6 } },
      { key: 'gstin', label: 'GSTIN', formLabel: 'GSTIN/UIN', type: 'text' },
      { key: 'qDate', label: 'QDate', formLabel: 'Quotation Date', type: 'date' },
      { key: 'totalAmount', label: 'totalAmount', type: 'currency', computed: true },
      { key: 'gstAmount', label: 'gstAmount', type: 'currency', computed: true },
      { key: 'payableAmount', label: 'Payable Amount', type: 'currency', computed: true },
    ],
  },

  // "Invoice Management — Comprehensive view of all proforma invoices"
  pi: {
    label: 'PI',
    title: 'Invoice Management',
    singular: 'Proforma Invoice',
    statuses: ['POreq', 'Draft', 'Sent', 'Paid', 'Cancelled'],
    employeeCanCreate: true,
    totals: 'pi',
    fields: [
      { key: 'piNumber', label: 'PI Number', type: 'text', autoNumber: { style: 'fy', code: 'PI', pad: 4 } },
      { key: 'piId', label: 'PI ID', type: 'text', autoNumber: { style: 'hex', code: 'Pi' } },
      { key: 'customerName', label: 'Name', formLabel: 'Customer Name', type: 'text', required: true, group: 'customer' },
      { key: 'address', label: 'Address', type: 'textarea', group: 'customer' },
      { key: 'phone', label: 'Phone', type: 'tel', group: 'customer' },
      { key: 'gstin', label: 'GSTIN', type: 'text', group: 'customer' },
      { key: 'state', label: 'State', type: 'text', group: 'customer' },
      { key: 'piDate', label: 'PI Date', type: 'date', group: 'reference' },
      { key: 'yourRef', label: 'Your Ref', formLabel: 'Ref No', type: 'text', group: 'reference' },
      { key: 'refDate', label: 'Ref Date', type: 'date', group: 'reference' },
      // the customer's purchase order this invoice is raised against
      { key: 'poNo', label: 'PO No', type: 'text', group: 'reference' },
      { key: 'poDate', label: 'PO Date', type: 'date', group: 'reference' },
      { key: 'paymentTerms', label: 'Payment Terms', type: 'text', group: 'reference' },
      { key: 'delivery', label: 'Delivery', type: 'text', group: 'reference' },
      { key: 'jurisdiction', label: 'Jurisdiction', type: 'text', group: 'reference' },
      { key: 'discount', label: 'Discount', formLabel: 'Discount %', type: 'number', group: 'financial', suffix: '%' },
      { key: 'lpAmount', label: 'LP Amount', type: 'currency', group: 'financial' },
      { key: 'freight', label: 'Freight', type: 'currency', group: 'financial' },
      { key: 'gst', label: 'GST %', type: 'number', group: 'financial' },
      { key: 'certification', label: 'Certification', type: 'select', options: YES_NO, group: 'flags' },
      { key: 'goodsReturn', label: 'Goods Return', type: 'select', options: YES_NO, group: 'flags' },
      { key: 'interestRate', label: 'Interest Rate', formLabel: 'Interest Rate %', type: 'number', group: 'flags' },
      {
        key: 'items', label: 'Product Items', type: 'items',
        columns: [
          { key: 'itemName', label: 'Item Name', formLabel: 'Product', type: 'text' },
          { key: 'unitDescription', label: 'Unit Description', type: 'text' },
          { key: 'uom', label: 'UOM', type: 'text' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
          { key: 'total', label: 'Total', type: 'currency', computed: true },
        ],
        lineTotal: { key: 'total', qty: 'quantity', price: 'unitPrice' },
      },
      { key: 'fy', label: 'FY', type: 'text', computed: true },
      { key: 'itemsTotal', label: 'Items Total', type: 'currency', computed: true },
      { key: 'subtotal', label: 'Subtotal', type: 'currency', computed: true },
      { key: 'gstAmount', label: 'GST', type: 'currency', computed: true },
      { key: 'roundOff', label: 'Round Off', type: 'currency', computed: true },
      { key: 'totalPayable', label: 'Total Payable', type: 'currency', computed: true },
    ],
  },

  // "Quotation Management" cards -> View More
  quotations: {
    label: 'Quotations',
    title: 'Quotation Management',
    singular: 'Quotation',
    statuses: ['quotsaccess', 'Draft', 'Sent', 'Accepted', 'Rejected'],
    employeeCanCreate: true,
    totals: 'quotation',
    fields: [
      { key: 'enquiryNo', label: 'Enquiry No', type: 'text', autoNumber: { style: 'random', code: 'ENQ', digits: 6 } },
      { key: 'referenceNo', label: 'Reference No', type: 'text', autoNumber: { style: 'fy', code: 'OFF', pad: 0 } },
      { key: 'customerName', label: 'Customer', type: 'text', required: true },
      { key: 'paymentDue', label: 'Payment Due', type: 'text' },
      { key: 'validity', label: 'Validity', type: 'text' },
      { key: 'warranty', label: 'Warranty', type: 'text' },
      { key: 'delivery', label: 'Delivery', type: 'text' },
      { key: 'discount', label: 'Discount', type: 'text' },
      { key: 'gst', label: 'GST', formLabel: 'GST %', type: 'number', suffix: '%' },
      { key: 'lpAmount', label: 'LP Amount', type: 'currency' },
      { key: 'freight', label: 'Freight Charges', type: 'currency' },
      {
        key: 'products', label: 'Product Items', type: 'items',
        columns: [
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'hsnCode', label: 'HSN Code', type: 'text' },
          { key: 'unitDescription', label: 'Unit Description', type: 'text' },
          { key: 'uom', label: 'UOM', type: 'text' },
          { key: 'quantity', label: 'Quantity', type: 'number' },
          { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
          { key: 'total', label: 'Total', type: 'currency', computed: true },
        ],
        lineTotal: { key: 'total', qty: 'quantity', price: 'unitPrice' },
      },
      { key: 'itemsTotal', label: 'Items Total', type: 'currency', computed: true },
      { key: 'gstAmount', label: 'GST Amount', type: 'currency', computed: true },
      { key: 'totalPayable', label: 'Total Payable Amount', type: 'currency', computed: true },
    ],
  },

  // "Product Requests" cards — title is the requesting employee
  productRequests: {
    label: 'Product Requests',
    title: 'Product Requests',
    singular: 'Product Request',
    statuses: ['products-status', 'Pending', 'Approved', 'Delivered', 'Rejected'],
    employeeCanCreate: true,
    fields: [
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'company', label: 'Company', type: 'text', required: true },
      { key: 'contactPerson', label: 'Contact Person', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      {
        key: 'products', label: 'Products Requested', type: 'items',
        columns: [
          { key: 'name', label: 'Product', type: 'text' },
          { key: 'quantity', label: 'Units', type: 'number' },
        ],
      },
    ],
  },

  // "All Sales Orders"
  salesOrders: {
    label: 'Sales Orders',
    title: 'All Sales Orders',
    singular: 'Sales Order',
    statuses: ['Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'],
    employeeCanCreate: true,
    totals: 'salesOrder',
    fields: [
      { key: 'orderId', label: 'Sales Order ID', type: 'text', autoNumber: { style: 'random', code: 'ORD', digits: 3 } },
      { key: 'customer', label: 'Customer', type: 'text', required: true },
      { key: 'orderDate', label: 'Order Date', type: 'date' },
      { key: 'deliveryDate', label: 'Delivery Date', type: 'date' },
      { key: 'gst', label: 'GST %', type: 'number' },
      {
        key: 'items', label: 'Items', type: 'items',
        columns: [
          { key: 'itemName', label: 'Item', type: 'text' },
          { key: 'quantity', label: 'Qty', type: 'number' },
          { key: 'unitPrice', label: 'Unit Price', type: 'currency' },
          { key: 'total', label: 'Total', type: 'currency', computed: true },
        ],
        lineTotal: { key: 'total', qty: 'quantity', price: 'unitPrice' },
      },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
      { key: 'grandTotal', label: 'Grand Total', type: 'currency', computed: true },
    ],
  },

  // "Service Engineers" — field visits; title is the engineer, subtitle the company
  workVisits: {
    label: 'Work Visits',
    title: 'Service Engineers',
    singular: 'Work Visit',
    statuses: null,
    employeeCanCreate: true,
    fields: [
      { key: 'company', label: 'Company', type: 'text', required: true },
      { key: 'visitDate', label: 'Visit Date', type: 'date' },
      { key: 'machine', label: 'Machine', type: 'text' },
      { key: 'productDescription', label: 'Product Description', type: 'textarea' },
      { key: 'complaints', label: 'Complaints', type: 'textarea' },
      { key: 'assessment', label: 'Assessment', type: 'textarea' },
    ],
  },

  // "Service Details"
  serviceDetails: {
    label: 'Service Details',
    title: 'Service Details',
    singular: 'Service',
    statuses: null,
    employeeCanCreate: true,
    fields: [
      { key: 'client', label: 'Client', type: 'text', required: true },
      { key: 'eid', label: 'EID', type: 'text' },
      { key: 'customerInward', label: 'Customer Inward', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'material', label: 'Material', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'serialNo', label: 'Serial No', type: 'text' },
      { key: 'powerConsumption', label: 'Power Consumption', type: 'text' },
      { key: 'serviceStart', label: 'Service Start', type: 'date' },
      { key: 'serviceEnd', label: 'Service End', type: 'date' },
      { key: 'serviceStatus', label: 'Service Status', type: 'select', options: ['Pending', 'In Progress', 'Completed'] },
      { key: 'billingStatus', label: 'Billing Status', type: 'select', options: ['Pending', 'Done'] },
    ],
  },

  // "Inventory Management": current stock = inward − outward (worked out by the server)
  inventory: {
    label: 'Inventory',
    title: 'Inventory Management',
    singular: 'Product',
    statuses: null,
    employeeCanCreate: false,
    totals: 'inventory',
    fields: [
      { key: 'itemCode', label: 'Item Code', type: 'text', required: true, table: true },
      { key: 'model', label: 'Model', type: 'text', table: true },
      { key: 'brand', label: 'Brand', type: 'text', table: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'price', label: 'Price', type: 'currency', table: true },
      { key: 'inward', label: 'Inward', type: 'number', table: true },
      { key: 'outward', label: 'Outward', type: 'number', table: true },
      { key: 'current', label: 'Current', type: 'number', computed: true, table: true },
      { key: 'minStock', label: 'Min. Stock', type: 'number' },
      { key: 'location', label: 'Storage Location', type: 'text' },
    ],
  },
};

// Company resources (laptops, SIMs, bikes…) are stored on each employee — see routes/employees.js.
const RESOURCE_STATUSES = ['provided', 'returned', 'lost'];

module.exports = { modules, RESOURCE_STATUSES, LEAD_STAGES, CONVERTED, NOT_CONVERTED };
