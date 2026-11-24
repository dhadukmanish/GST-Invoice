import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  ChevronDown,
  FileText,
  Home,
  IndianRupee,
  Inbox,
  KeyRound,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  UserCog,
  X,
} from 'lucide-react';
import { fmtDate } from '@gst/shared';
import { useAuth } from '@/lib/store';
import { queryClient } from '@/lib/api';
import { cx } from './ui';

type NavItem = { to: string; label: string; icon: ReactNode; adminOnly?: boolean; end?: boolean };

const TENANT_NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: <Home className="h-4 w-4" />, end: true },
      { to: '/invoices', label: 'Sales Invoices', icon: <FileText className="h-4 w-4" /> },
      { to: '/payments', label: 'Payments', icon: <IndianRupee className="h-4 w-4" /> },
    ],
  },
  {
    section: 'Masters',
    items: [
      { to: '/customers', label: 'Customers', icon: <Users className="h-4 w-4" /> },
      { to: '/items', label: 'Items', icon: <Package className="h-4 w-4" /> },
    ],
  },
  { section: 'Reports', items: [{ to: '/reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" /> }] },
  {
    section: 'Settings',
    items: [
      { to: '/settings/company', label: 'Company', icon: <Building2 className="h-4 w-4" />, adminOnly: true },
      { to: '/settings/invoice', label: 'Invoice Settings', icon: <Settings2 className="h-4 w-4" />, adminOnly: true },
      { to: '/settings/templates', label: 'Invoice Templates', icon: <LayoutTemplate className="h-4 w-4" />, adminOnly: true },
      { to: '/settings/whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" />, adminOnly: true },
      { to: '/settings/users', label: 'Users', icon: <UserCog className="h-4 w-4" />, adminOnly: true },
    ],
  },
];

const ADMIN_NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Super Admin',
    items: [
      { to: '/admin', label: 'Clients', icon: <ShieldCheck className="h-4 w-4" />, end: true },
      { to: '/admin/requests', label: 'Requests', icon: <Inbox className="h-4 w-4" /> },
      { to: '/admin/settings', label: 'Platform Settings', icon: <Settings2 className="h-4 w-4" /> },
    ],
  },
];

function Sidebar({ nav, onNavigate, appName, sub }: { nav: typeof TENANT_NAV; onNavigate?: () => void; appName: string; sub: string }) {
  const role = useAuth((s) => s.session?.user.role);
  return (
    <div className="flex h-full flex-col bg-brand-900 text-slate-300">
      <div className="px-5 pb-4 pt-5">
        <div className="text-lg font-extrabold tracking-tight text-white">{appName}</div>
        <div className="truncate text-[11px] text-slate-400">{sub}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {nav.map((g) => {
          const items = g.items.filter((i) => !i.adminOnly || role === 'admin');
          if (!items.length) return null;
          return (
            <div key={g.section}>
              <div className="mx-2 mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">{g.section}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate} className={({ isActive }) => cx('my-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition', isActive ? 'bg-white/10 font-semibold text-white' : 'hover:bg-white/5 hover:text-white')}>
                  {i.icon}
                  {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function UserMenu() {
  const session = useAuth((s) => s.session);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!session) return null;
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100" onClick={() => setOpen(!open)}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{(session.user.name || session.user.username).slice(0, 2).toUpperCase()}</span>
        <span className="hidden max-w-[140px] truncate sm:block">{session.user.name || session.user.username}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-line bg-white py-1 shadow-lg">
            <div className="border-b border-line px-3 py-2 text-xs text-slate-500">
              Signed in as <b className="text-slate-700">{session.user.username}</b>
              <div className="capitalize">{session.user.role}</div>
            </div>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setOpen(false); nav(session.user.role === 'superadmin' ? '/admin/account' : '/account'); }}>
              <KeyRound className="h-4 w-4" /> Change password
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { logout(); queryClient.clear(); nav('/login'); }}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/invoices\/new/, 'New Invoice'],
  [/^\/invoices\/[^/]+\/edit/, 'Edit Invoice'],
  [/^\/invoices\/./, 'Invoice'],
  [/^\/invoices/, 'Sales Invoices'],
  [/^\/payments/, 'Payments'],
  [/^\/customers\/./, 'Customer Ledger'],
  [/^\/customers/, 'Customers'],
  [/^\/items/, 'Items'],
  [/^\/reports/, 'Reports'],
  [/^\/settings\/company/, 'Company'],
  [/^\/settings\/invoice/, 'Invoice Settings'],
  [/^\/settings\/templates/, 'Invoice Templates'],
  [/^\/settings\/whatsapp/, 'WhatsApp'],
  [/^\/settings\/users/, 'Users'],
  [/^\/account/, 'Account'],
  [/^\/admin\/clients\/./, 'Client'],
  [/^\/admin\/requests/, 'Requests'],
  [/^\/admin\/settings/, 'Platform Settings'],
  [/^\/admin/, 'Clients'],
];

export function AppLayout({ admin }: { admin?: boolean }) {
  const session = useAuth((s) => s.session);
  const stopImp = useAuth((s) => s.stopImpersonating);
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setDrawer(false), [loc.pathname]);
  const appName = String(session?.branding?.appName || 'GST Invoice');
  const sub = admin ? 'Super Admin' : session?.tenant?.businessName ?? '';
  const title = TITLES.find(([re]) => re.test(loc.pathname))?.[1] ?? '';
  const t = session?.tenant;
  const navDef = admin ? ADMIN_NAV : TENANT_NAV;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 lg:block">
        <Sidebar nav={navDef} appName={appName} sub={sub} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">
            <button className="absolute right-2 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:text-white" onClick={() => setDrawer(false)}>
              <X className="h-5 w-5" />
            </button>
            <Sidebar nav={navDef} appName={appName} sub={sub} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        {session?.impersonating && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-purple-700 px-4 py-2 text-center text-xs text-white">
            Viewing as client <b>{t?.businessName}</b> (support mode)
            <button
              className="rounded bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
              onClick={() => {
                stopImp();
                queryClient.clear();
                nav('/admin');
              }}
            >
              Back to Super Admin
            </button>
          </div>
        )}
        {t && t.daysLeft <= 7 && (
          <div className={cx('px-4 py-2 text-center text-xs font-medium', t.daysLeft <= 2 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900')}>
            Your subscription {t.daysLeft < 0 ? 'has expired' : `ends on ${fmtDate(t.validUntil, true)} (${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'} left)`}. Please renew
            {session?.branding?.supportPhone ? ` — call ${String(session.branding.supportPhone)}` : ''}.
          </div>
        )}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-line bg-white/95 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-slate-900">{title}</div>
              <div className="truncate text-[11px] text-slate-500 lg:hidden">{sub}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!admin && (
              <NavLink to="/invoices/new" className="btn-primary hidden sm:inline-flex">
                <Plus className="h-4 w-4" /> New Invoice
              </NavLink>
            )}
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-3 pb-28 pt-4 sm:px-5 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {!admin && !/^\/invoices\/(new|[^/]+\/edit)/.test(loc.pathname) && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const item = (to: string, label: string, icon: ReactNode, end?: boolean) => (
    <NavLink to={to} end={end} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium', isActive ? 'text-brand-700' : 'text-slate-500')}>
      {icon}
      {label}
    </NavLink>
  );
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex items-end border-t border-line bg-white lg:hidden">
      {item('/', 'Home', <Home className="h-5 w-5" />, true)}
      {item('/invoices', 'Invoices', <FileText className="h-5 w-5" />)}
      <NavLink to="/invoices/new" className="-mt-5 flex flex-1 flex-col items-center gap-0.5 pb-2 text-[10.5px] font-semibold text-brand-700">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white">
          <Plus className="h-6 w-6" />
        </span>
        New
      </NavLink>
      {item('/payments', 'Payments', <IndianRupee className="h-5 w-5" />)}
      {item('/customers', 'Customers', <Users className="h-5 w-5" />)}
    </nav>
  );
}
