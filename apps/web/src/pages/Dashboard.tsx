import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Plus } from 'lucide-react';
import { fmtDate, money } from '@gst/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { Badge, Loading, Money, Stat } from '@/components/ui';

export default function Dashboard() {
  const session = useAuth((s) => s.session);
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<any>('/api/dashboard') });
  if (q.isLoading || !q.data) return <Loading />;
  const { kpi, trend, recent, topDue } = q.data;
  const max = Math.max(1, ...trend.map((t: any) => Math.max(t.sales, t.received)));
  const hour = new Date().getHours();
  return (
    <div className="space-y-4">
      {session?.tenant && !session.tenant.setupDone && session.user.role === 'admin' && (
        <Link to="/settings/company" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">Complete your company details (state, GSTIN, bank) so invoices calculate GST correctly.</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}{session?.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}</h2>
          <p className="text-sm text-slate-500">Here's your business today.</p>
        </div>
        <Link to="/invoices/new" className="btn-primary hidden sm:inline-flex"><Plus className="h-4 w-4" /> New Invoice</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today's Sales" value={money(kpi.today_sales)} sub={`${kpi.today_count} invoice(s) · received ${money(kpi.today_received)}`} />
        <Stat label="This Month" value={money(kpi.month_sales)} sub={`${kpi.month_count} invoices · GST ${money(kpi.month_tax)}`} />
        <Stat label="Outstanding" value={money(kpi.outstanding)} sub={`${kpi.outstanding_customers} customer(s)`} tone="red" />
        <Stat label="Overdue" value={money(kpi.overdue)} sub={`Received this month ${money(kpi.month_received)}`} tone={kpi.overdue > 0 ? 'amber' : undefined} />
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Last 14 days</h3>
          <div className="flex gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-600" /> Sales</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-emerald-500" /> Received</span>
          </div>
        </div>
        <div className="flex h-32 items-end gap-1 sm:gap-2">
          {trend.map((t: any) => (
            <div key={t.d} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]" title={`${fmtDate(t.d)} · Sales ${money(t.sales)} · Received ${money(t.received)}`}>
              <div className="w-1/2 max-w-[14px] rounded-t bg-brand-600" style={{ height: `${(t.sales / max) * 100}%`, minHeight: t.sales ? 3 : 1 }} />
              <div className="w-1/2 max-w-[14px] rounded-t bg-emerald-500" style={{ height: `${(t.received / max) * 100}%`, minHeight: t.received ? 3 : 1 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{fmtDate(trend[0]?.d, true)}</span>
          <span>Today</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold">Recent invoices</h3>
            <Link to="/invoices" className="text-xs font-semibold text-brand-700">View all</Link>
          </div>
          {recent.length ? (
            <div className="divide-y divide-slate-100">
              {recent.map((r: any) => (
                <Link key={r.id} to={`/invoices/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.customerName}</div>
                    <div className="text-xs text-slate-500">{r.invoiceNo} · {fmtDate(r.invoiceDate, true)}</div>
                  </div>
                  <div className="text-right">
                    <Money v={r.total} className="text-sm font-semibold" />
                    <div><Badge status={r.status} /></div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">No invoices yet. <Link to="/invoices/new" className="font-semibold text-brand-700">Create your first invoice</Link></div>
          )}
        </div>
        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold">Top dues</h3>
            <Link to="/reports?tab=outstanding" className="text-xs font-semibold text-brand-700">Report</Link>
          </div>
          {topDue.length ? (
            <div className="divide-y divide-slate-100">
              {topDue.map((r: any) => (
                <Link key={r.customerId} to={`/customers/${r.customerId}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.invoices} invoice(s) · since {fmtDate(r.oldest, true)}</div>
                  </div>
                  <Money v={r.balance} className="text-sm font-semibold text-red-600" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">No pending dues 🎉</div>
          )}
        </div>
      </div>
    </div>
  );
}
