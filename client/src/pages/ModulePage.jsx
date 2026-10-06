import { Link, useParams, useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell';
import RecordsPanel from '../components/RecordsPanel';
import { BackPill, Loading } from '../components/Bits';
import DocumentsPage from './DocumentsPage';
import { CustomersPage, LeadEnquiryPage, TodayLeadsPage } from './TablePages';
import { InvoicePage, ProductRequestsPage, QuotationPage, SalesOrdersPage, ServiceDetailsPage, ServiceEngineersPage } from './CardPages';
import { levelOf } from '../access';
import { useApp } from '../AppContext';
import { homeFor } from './Login';

// Picks the screen for a module, matching the original CRM:
//   leads (admin)      -> Lead Enquiry (date filter + Fetch Enquiries)
//   ?today=...         -> Today's Converted / Not Converted
//   customers          -> Completed Enquiries
//   poRequests         -> Purchase Order Management cards
//   pi                 -> Invoice Management (list -> detail)
//   quotations         -> Quotation Management cards -> View More
//   productRequests    -> Product Requests cards
//   salesOrders        -> All Sales Orders
//   workVisits         -> Service Engineers
//   serviceDetails     -> Service Details
//   everything else    -> title + table
export default function ModulePage() {
  const { module: moduleKey } = useParams();
  const [params] = useSearchParams();
  const { modules, user } = useApp();
  const isAdmin = user?.role === 'admin';
  const today = params.get('today') || '';
  const createdBy = params.get('createdBy') || '';
  const mod = modules?.[moduleKey];

  if (!modules) return <Shell><div className="page bg-soft"><Loading /></div></Shell>;
  if (!mod) {
    return (
      <Shell>
        <div className="page bg-soft center-msg">
          Page not found. <Link to={homeFor(user)}>Back to dashboard</Link>
        </div>
      </Shell>
    );
  }

  const back = createdBy && isAdmin ? `/admin/employees/${createdBy}` : homeFor(user);
  const key = `${moduleKey}-${today}-${createdBy}`;

  if (!levelOf(user, moduleKey)) {
    return <Shell><div className="page bg-soft center-msg">Your role doesn't have access to {mod.label}. <Link to={homeFor(user)}>Back to dashboard</Link></div></Shell>;
  }
  const props = { back, createdBy };
  if (moduleKey === 'leads' && today) return <TodayLeadsPage key={key} back={back} today={today} />;
  if (moduleKey === 'leads' && isAdmin) return <LeadEnquiryPage key={key} {...props} />;
  if (moduleKey === 'customers') return <CustomersPage key={key} {...props} />;
  if (moduleKey === 'poRequests') return <DocumentsPage key={key} {...props} moduleKey={moduleKey} />;
  if (moduleKey === 'pi') return <InvoicePage key={key} {...props} />;
  if (moduleKey === 'quotations') return <QuotationPage key={key} {...props} />;
  if (moduleKey === 'productRequests') return <ProductRequestsPage key={key} {...props} />;
  if (moduleKey === 'salesOrders') return <SalesOrdersPage key={key} {...props} />;
  if (moduleKey === 'workVisits') return <ServiceEngineersPage key={key} {...props} />;
  if (moduleKey === 'serviceDetails') return <ServiceDetailsPage key={key} {...props} />;

  const level = levelOf(user, moduleKey);
  const base = mod.title || mod.label;
  const title = level === 'own' ? `My ${base}` : moduleKey === 'inventory' ? base : `All ${base}`;

  return (
    <Shell>
      <div className="page bg-soft">
        <div className="page-inner">
          <div className="head-row center-title">
            <div><BackPill to={back} /></div>
            <h1 className="title-mgmt">{title}</h1>
            <div />
          </div>
          <div className="module-card">
            <RecordsPanel key={key} moduleKey={moduleKey} createdBy={createdBy} startAdding={params.get('new') === '1'} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
