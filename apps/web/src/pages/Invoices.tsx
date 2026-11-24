import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileText, Plus } from 'lucide-react';
import { fmtDate, money } from '@gst/shared';
import { api, qs } from '@/lib/api';
import { downloadCsv } from '@/lib/pdf';
import { Badge, Empty, Loading, Money, PageHeader, SearchBox, Tabs } from '@/components/ui';

type Status = 'all' | 'due' | 'unpaid' | 'partial' | 'paid' | 'cancelled';

export default function Invoices() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') as Status) || 'all';
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['invoices', status, q, from, to, page],
    queryFn: () => api.get<any>(`/api/invoices${qs({ status, q, from, to, page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.count / d.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        subtitle={d ? `${d.count} invoice(s) · ${money(d.total)} · due ${money(d.balance)}` : ' '}
        actions={
          <>
            <button
              className="btn-secondary"
              disabled={!d?.rows.length}
              onClick={() =>
                downloadCsv('invoices.csv', d.rows.map((r: any) => ({ ...r, customerName: r.customer?.name, gstin: r.customer?.gstin })), [
                  { key: 'invoiceNo', label: 'Invoice No' },
                  { key: 'invoiceDate', label: 'Date' },
                  { key: 'customerName', label: 'Customer' },
                  { key: 'gstin', label: 'GSTIN' },
                  { key: 'taxable', label: 'Taxable' },
                  { key: 'tax', label: 'GST' },
                  { key: 'total', label: 'Total' },
                  { key: 'paid', label: 'Received' },
                  { key: 'balance', label: 'Balance' },
                  { key: 'status', label: 'Status' },
                ])
              }
            >
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            <Link to="/invoices/new" className="btn-primary"><Plus className="h-4 w-4" /> New</Link>
          </>
        }
      />
      <Tabs
        value={status}
        onChange={(v) => { setSp(v === 'all' ? {} : { status: v }); setPage(1); }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'due', label: 'Due' },
          { value: 'unpaid', label: 'Unpaid' },
          { value: 'partial', label: 'Partial' },
          { value: 'paid', label: 'Paid' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Invoice no, customer, mobile…" className="col-span-2 sm:w-72" />
        <input type="date" className="input sm:w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} title="From" />
        <input type="date" className="input sm:w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} title="To" />
      </div>

      {list.isLoading ? (
        <Loading />
      ) : !d?.rows.length ? (
        <div className="card"><Empty icon={<FileText className="h-10 w-10" />} title="No invoices found" text="Create an invoice — it takes less than a minute." action={<Link className="btn-primary" to="/invoices/new"><Plus className="h-4 w-4" /> New Invoice</Link>} /></div>
      ) : (
        <>
          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {d.rows.map((r: any) => (
              <Link key={r.id} to={`/invoices/${r.id}`} className="card flex items-center gap-3 p-3 active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.customer?.name}</div>
                  <div className="text-xs text-slate-500">{r.invoiceNo} · {fmtDate(r.invoiceDate, true)}</div>
                </div>
                <div className="text-right">
                  <Money v={r.total} className="font-semibold" />
                  <div className="mt-0.5 flex items-center justify-end gap-1">
                    {r.balance > 0 && r.status !== 'cancelled' && <span className="text-[11px] text-red-600">{money(r.balance)}</span>}
                    <Badge status={r.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {/* desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Invoice</th><th className="th">Date</th><th className="th">Customer</th><th className="th text-right">Taxable</th><th className="th text-right">GST</th><th className="th text-right">Total</th><th className="th text-right">Balance</th><th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r: any) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/invoices/${r.id}`)}>
                    <td className="td font-semibold text-brand-700">{r.invoiceNo}</td>
                    <td className="td whitespace-nowrap">{fmtDate(r.invoiceDate)}</td>
                    <td className="td">
                      <div className="font-medium">{r.customer?.name}</div>
                      <div className="text-[11px] text-slate-500">{r.customer?.gstin || 'Unregistered'} · {r.isInterstate ? 'IGST' : 'CGST+SGST'}</div>
                    </td>
                    <td className="td text-right"><Money v={r.taxable} /></td>
                    <td className="td text-right"><Money v={r.tax} /></td>
                    <td className="td text-right font-semibold"><Money v={r.total} /></td>
                    <td className="td text-right">{r.balance > 0 && r.status !== 'cancelled' ? <Money v={r.balance} className="text-red-600" /> : '—'}</td>
                    <td className="td"><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
              <span>Page {page} / {pages}</span>
              <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
