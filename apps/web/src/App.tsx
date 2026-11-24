import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth, type Session } from '@/lib/store';
import { AppLayout } from '@/components/Layout';
import { Loading, Toasts } from '@/components/ui';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Invoices from '@/pages/Invoices';
import InvoiceForm from '@/pages/InvoiceForm';
import InvoiceView from '@/pages/InvoiceView';
import Customers, { CustomerLedger } from '@/pages/Customers';
import Items from '@/pages/Items';
import Payments from '@/pages/Payments';
import Account from '@/pages/Account';

const PublicInvoice = lazy(() => import('@/pages/PublicInvoice'));
const Reports = lazy(() => import('@/pages/Reports'));
const Company = lazy(() => import('@/pages/settings/Company'));
const InvoiceSettings = lazy(() => import('@/pages/settings/InvoiceSettings'));
const Templates = lazy(() => import('@/pages/settings/Templates'));
const WhatsAppSettings = lazy(() => import('@/pages/settings/WhatsApp'));
const Users = lazy(() => import('@/pages/settings/Users'));
const Clients = lazy(() => import('@/pages/admin/Clients'));
const ClientDetail = lazy(() => import('@/pages/admin/ClientDetail'));
const Requests = lazy(() => import('@/pages/admin/Requests'));
const Platform = lazy(() => import('@/pages/admin/Platform'));

/** Loads /me once per token; sends expired / suspended clients to a clear message. */
function RequireAuth({ children, role }: { children: ReactNode; role: 'tenant' | 'super' }) {
  const { token, session, setSession, logout } = useAuth();
  const loc = useLocation();
  const me = useQuery({ queryKey: ['me', token], queryFn: () => api.get<Session>('/api/auth/me'), enabled: !!token, retry: false, staleTime: 60_000 });
  useEffect(() => {
    if (me.data) setSession(me.data);
  }, [me.data, setSession]);
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (me.error) {
    const e = me.error as ApiError;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <h1 className="mb-2 text-lg font-bold">{e.status === 402 ? 'Subscription expired' : e.status === 403 ? 'Account suspended' : 'Please sign in again'}</h1>
          <p className="mb-4 text-sm text-slate-600">{e.message}</p>
          <button className="btn-primary" onClick={() => logout()}>Back to sign in</button>
        </div>
      </div>
    );
  }
  const s = session;
  if (!s) return <Loading />;
  if (role === 'super' && s.user.role !== 'superadmin') return <Navigate to="/" replace />;
  if (role === 'tenant' && s.user.role === 'superadmin') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const role = useAuth((s) => s.session?.user.role);
  return role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/v/:token" element={<PublicInvoice />} />
          <Route element={<RequireAuth role="super"><AppLayout admin /></RequireAuth>}>
            <Route path="/admin" element={<Clients />} />
            <Route path="/admin/clients/:id" element={<ClientDetail />} />
            <Route path="/admin/requests" element={<Requests />} />
            <Route path="/admin/settings" element={<Platform />} />
            <Route path="/admin/account" element={<Account />} />
          </Route>
          <Route element={<RequireAuth role="tenant"><AppLayout /></RequireAuth>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/new" element={<InvoiceForm />} />
            <Route path="/invoices/:id" element={<InvoiceView />} />
            <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerLedger />} />
            <Route path="/items" element={<Items />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/account" element={<Account />} />
            <Route path="/settings/company" element={<AdminOnly><Company /></AdminOnly>} />
            <Route path="/settings/invoice" element={<AdminOnly><InvoiceSettings /></AdminOnly>} />
            <Route path="/settings/templates" element={<AdminOnly><Templates /></AdminOnly>} />
            <Route path="/settings/whatsapp" element={<AdminOnly><WhatsAppSettings /></AdminOnly>} />
            <Route path="/settings/users" element={<AdminOnly><Users /></AdminOnly>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toasts />
    </>
  );
}
