import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './AppContext';
import Login, { homeFor } from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import EmployeeDashboard from './pages/EmployeeDashboard';
import ModulePage from './pages/ModulePage';
import EmployeeProfile from './pages/EmployeeProfile';
import RegisterPage from './pages/RegisterPage';
import ResetPage from './pages/ResetPage';
import CompanyResourcesPage from './pages/CompanyResourcesPage';
import DocumentsPage from './pages/DocumentsPage';
import { ProductRequestsPage } from './pages/CardPages';
import SalesDashboard from './pages/sales/SalesDashboard';
import { SalesCustomers, SalesInventory, SalesInvoices, SalesLeadsByOutcome, SalesProfile, SalesQuotations, PrintInvoice } from './pages/sales/SalesPages';
import { EmailLeadsPage, EnterEnquiryPage, LeadFillerDashboard, LeadFillerEnquiries } from './pages/leadfiller/LeadFillerPages';
import ServiceDashboard from './pages/service/ServiceDashboard';
import { CreateProformaInvoice, CreatePurchaseOrder } from './pages/create/CreateDocuments';
import Shell from './components/Shell';
import { Loading } from './components/Bits';

// role: 'admin' | 'employee'; dash: 'sales' | 'leads' | 'service' limits a route to that dashboard's logins
function Guard({ role, dash, children }) {
  const { user, ready } = useApp();
  if (!ready) return <Shell><Loading /></Shell>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  if (dash && user.dashboard !== dash) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user, ready } = useApp();
  if (!ready) return <Shell><Loading /></Shell>;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* same URL as the original CRM, plus a correctly spelled alias */}
      <Route path="/admin/adminDasboard" element={<Guard role="admin"><AdminDashboard /></Guard>} />
      <Route path="/admin/adminDashboard" element={<Navigate to="/admin/adminDasboard" replace />} />
      <Route path="/admin/register" element={<Guard role="admin"><RegisterPage /></Guard>} />
      <Route path="/admin/register/:id" element={<Guard role="admin"><RegisterPage /></Guard>} />
      <Route path="/admin/resetEmail" element={<Guard role="admin"><ResetPage mode="email" /></Guard>} />
      <Route path="/admin/resetPassword" element={<Guard role="admin"><ResetPage mode="password" /></Guard>} />
      <Route path="/admin/Purchaseorder" element={<Navigate to="/admin/records/poRequests" replace />} />
      <Route path="/admin/companyResources" element={<Guard role="admin"><CompanyResourcesPage /></Guard>} />
      <Route path="/admin/records/:module" element={<Guard role="admin"><ModulePage /></Guard>} />
      <Route path="/admin/employees/:id" element={<Guard role="admin"><EmployeeProfile /></Guard>} />
      <Route path="/employee/dashboard" element={<Guard role="employee"><EmployeeDashboard /></Guard>} />
      <Route path="/employee/records/:module" element={<Guard role="employee"><ModulePage /></Guard>} />
      <Route path="/employee/companyResources" element={<Guard role="employee"><CompanyResourcesPage /></Guard>} />
      {/* Sales team (Sales Head / Sales Employee) — same URLs as the original CRM */}
      <Route path="/SaleteamDasboard/Dasboard" element={<Guard dash="sales"><SalesDashboard /></Guard>} />
      <Route path="/SaleteamDasboard/viewprofile" element={<Guard dash="sales"><SalesProfile /></Guard>} />
      <Route path="/SaleteamDasboard/customerConverted" element={<Guard dash="sales"><SalesLeadsByOutcome outcome="won" /></Guard>} />
      <Route path="/SaleteamDasboard/notConverted" element={<Guard dash="sales"><SalesLeadsByOutcome outcome="lost" /></Guard>} />
      <Route path="/SaleteamDasboard/customers" element={<Guard dash="sales"><SalesCustomers /></Guard>} />
      <Route path="/SaleteamDasboard/inventory" element={<Guard dash="sales"><SalesInventory /></Guard>} />
      <Route path="/SaleteamDasboard/invoices" element={<Guard dash="sales"><SalesInvoices /></Guard>} />
      <Route path="/SaleteamDasboard/quotations" element={<Guard dash="sales"><SalesQuotations /></Guard>} />
      <Route path="/SaleteamDasboard/purchaseOrder" element={<Guard dash="sales"><DocumentsPage moduleKey="poRequests" back="/SaleteamDasboard/Dasboard" /></Guard>} />
      <Route path="/SaleteamDasboard/productRequests" element={<Guard dash="sales"><ProductRequestsPage back="/SaleteamDasboard/Dasboard" /></Guard>} />
      {/* Service Engineer — same URL as the original CRM */}
      <Route path="/ServiceProject/Dashboard" element={<Guard dash="service"><ServiceDashboard /></Guard>} />
      <Route path="/ServiceProject/viewprofile" element={<Guard dash="service"><SalesProfile /></Guard>} />
      <Route path="/ServiceProject/inventory" element={<Guard dash="service"><SalesInventory /></Guard>} />
      {/* Lead Filler */}
      <Route path="/leadfiller/dashboard" element={<Guard dash="leads"><LeadFillerDashboard /></Guard>} />
      <Route path="/leadfiller/viewprofile" element={<Guard dash="leads"><SalesProfile /></Guard>} />
      <Route path="/leadfiller/enterEnquiry" element={<Guard dash="leads"><EnterEnquiryPage /></Guard>} />
      <Route path="/leadfiller/leadEnquiries" element={<Guard dash="leads"><LeadFillerEnquiries /></Guard>} />
      <Route path="/leadfiller/emailLeads" element={<Guard dash="leads"><EmailLeadsPage /></Guard>} />
      {/* full-page forms: Create Purchase Order / Proforma Invoice (?id= to edit) */}
      <Route path="/purchaseOrder/create" element={<Guard><CreatePurchaseOrder /></Guard>} />
      <Route path="/proformaInvoice/create" element={<Guard><CreateProformaInvoice /></Guard>} />
      <Route path="/print/pi/:id" element={<Guard><PrintInvoice /></Guard>} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
