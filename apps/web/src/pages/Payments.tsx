import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, IndianRupee } from 'lucide-react';
import { PAYMENT_MODES, fmtDate, money, todayIST } from '@gst/shared';
import { api, qs } from '@/lib/api';
import { downloadCsv } from '@/lib/pdf';
import { Empty, Loading, Money, PageHeader, SearchBox } from '@/components/ui';

export default function Payments() {
  const [from, setFrom] = useState(`${todayIST().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIST());
  const [mode, setMode] = useState('');
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['payments', from, to, mode, q], queryFn: () => api.get<any[]>(`/api/payments${qs({ from, to, mode, q })}`) });
  const rows = list.data ?? [];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byMode = PAYMENT_MODES.map((m) => ({ m, v: rows.filter((r) => r.mode === m).reduce((s, r) => s + r.amount, 0) })).filter((x) => x.v > 0);
  return (
    <div>
      <PageHeader
        title="Payments received"
        subtitle={`${rows.length} payment(s) · ${money(total)}`}
        actions={
          <>
            <button className="btn-secondary" disabled={!rows.length} onClick={() => downloadCsv('payments.csv', rows, [{ key: 'paymentDate', label: 'Date' }, { key: 'invoiceNo', label: 'Invoice' }, { key: 'customerName', label: 'Customer' }, { key: 'mode', label: 'Mode' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount' }])}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span>
            </button>
            <Link to="/invoices?status=due" className="btn-primary"><IndianRupee className="h-4 w-4" /> Receive</Link>
          </>
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex">
        <input type="date" className="input sm:w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input sm:w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="input sm:w-36" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All modes</option>
          {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <SearchBox value={q} onChange={setQ} placeholder="Customer / invoice / ref" className="sm:w-64" />
      </div>
      {!!byMode.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          {byMode.map((x) => <span key={x.m} className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-line">{x.m}: <b>{money(x.v)}</b></span>)}
        </div>
      )}
      {list.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <div className="card"><Empty icon={<IndianRupee className="h-10 w-10" />} title="No payments in this period" text="Record a payment from an invoice (Receive button)." /></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {rows.map((p) => (
            <Link key={p.id} to={`/invoices/${p.invoiceId}`} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.customerName}</div>
                <div className="truncate text-xs text-slate-500">{fmtDate(p.paymentDate, true)} · {p.invoiceNo} · {p.mode}{p.reference && ` · ${p.reference}`}</div>
              </div>
              <Money v={p.amount} className="font-semibold text-green-700" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
