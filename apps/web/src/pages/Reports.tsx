import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { addMonths, financialYear, fmtDate, money, stateName, todayIST } from '@gst/shared';
import { api, qs } from '@/lib/api';
import { downloadCsv } from '@/lib/pdf';
import { Loading, Money, PageHeader, Stat, Tabs } from '@/components/ui';

type Tab = 'sales' | 'gst' | 'outstanding';

function presets() {
  const t = todayIST();
  const m0 = `${t.slice(0, 7)}-01`;
  const prevStart = addMonths(m0, -1);
  const fyStart = `${financialYear(t).slice(0, 4)}-04-01`;
  return [
    { label: 'This month', from: m0, to: t },
    { label: 'Last month', from: prevStart, to: new Date(Date.parse(`${m0}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) },
    { label: 'This FY', from: fyStart, to: t },
  ];
}

export default function Reports() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'sales';
  const p = presets();
  const [range, setRange] = useState({ from: p[0].from, to: p[0].to });
  return (
    <div>
      <PageHeader title="Reports" subtitle="Sales register, GST summary and dues" />
      <Tabs value={tab} onChange={(v) => setSp({ tab: v })} tabs={[{ value: 'sales', label: 'Sales register' }, { value: 'gst', label: 'GST summary' }, { value: 'outstanding', label: 'Outstanding' }]} />
      {tab !== 'outstanding' && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input type="date" className="input w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-slate-400">to</span>
          <input type="date" className="input w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          {p.map((x) => (
            <button key={x.label} className="btn-secondary btn-sm" onClick={() => setRange({ from: x.from, to: x.to })}>{x.label}</button>
          ))}
        </div>
      )}
      {tab === 'sales' && <Sales {...range} />}
      {tab === 'gst' && <Gst {...range} />}
      {tab === 'outstanding' && <Outstanding />}
    </div>
  );
}

function Sales({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['rep-sales', from, to], queryFn: () => api.get<any[]>(`/api/reports/sales${qs({ from, to })}`) });
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  const sum = (k: string) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoices" value={rows.length} />
        <Stat label="Taxable" value={money(sum('taxable'))} />
        <Stat label="GST" value={money(sum('cgst') + sum('sgst') + sum('igst'))} />
        <Stat label="Total sales" value={money(sum('total'))} />
      </div>
      <div className="card overflow-x-auto">
        <div className="flex justify-end border-b border-line p-2">
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              downloadCsv(`sales_${from}_${to}.csv`, rows.map((r) => ({ ...r, pos: `${r.pos}-${stateName(r.pos)}` })), [
                { key: 'invoiceNo', label: 'Invoice No' }, { key: 'invoiceDate', label: 'Date' }, { key: 'customer', label: 'Customer' }, { key: 'gstin', label: 'GSTIN' }, { key: 'pos', label: 'Place of Supply' },
                { key: 'taxable', label: 'Taxable' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' }, { key: 'roundOff', label: 'Round Off' }, { key: 'total', label: 'Total' }, { key: 'paid', label: 'Received' }, { key: 'balance', label: 'Balance' },
              ])
            }
          >
            <Download className="h-4 w-4" /> CSV (for CA / Excel)
          </button>
        </div>
        <table className="w-full min-w-[820px]">
          <thead><tr><th className="th">Invoice</th><th className="th">Date</th><th className="th">Customer</th><th className="th text-right">Taxable</th><th className="th text-right">CGST</th><th className="th text-right">SGST</th><th className="th text-right">IGST</th><th className="th text-right">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.invoiceNo}>
                <td className="td font-medium">{r.invoiceNo}</td><td className="td whitespace-nowrap">{fmtDate(r.invoiceDate)}</td>
                <td className="td">{r.customer}<div className="text-[11px] text-slate-500">{r.gstin || 'B2C'}</div></td>
                <td className="td text-right"><Money v={r.taxable} /></td><td className="td text-right"><Money v={r.cgst} /></td><td className="td text-right"><Money v={r.sgst} /></td><td className="td text-right"><Money v={r.igst} /></td><td className="td text-right font-semibold"><Money v={r.total} /></td>
              </tr>
            ))}
            {!!rows.length && (
              <tr className="bg-slate-50 font-bold">
                <td className="td" colSpan={3}>Total</td><td className="td text-right"><Money v={sum('taxable')} /></td><td className="td text-right"><Money v={sum('cgst')} /></td><td className="td text-right"><Money v={sum('sgst')} /></td><td className="td text-right"><Money v={sum('igst')} /></td><td className="td text-right"><Money v={sum('total')} /></td>
              </tr>
            )}
          </tbody>
        </table>
        {!rows.length && <div className="p-8 text-center text-sm text-slate-500">No invoices in this period</div>}
      </div>
    </>
  );
}

function Gst({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ['rep-gst', from, to], queryFn: () => api.get<any>(`/api/reports/gst${qs({ from, to })}`) });
  if (q.isLoading || !q.data) return <Loading />;
  const { byRate, hsn, totals } = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Taxable value" value={money(totals.taxable)} sub={`${totals.invoices} invoices`} />
        <Stat label="CGST" value={money(totals.cgst)} />
        <Stat label="SGST" value={money(totals.sgst)} />
        <Stat label="IGST" value={money(totals.igst)} />
      </div>
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-sm font-semibold">Rate-wise (B2B / B2C)</h3>
          <button className="btn-secondary btn-sm" onClick={() => downloadCsv(`gst_rate_${from}_${to}.csv`, byRate.map((r: any) => ({ ...r, cgst: r.intra_tax / 2, sgst: r.intra_tax / 2 })), [{ key: 'kind', label: 'Type' }, { key: 'rate', label: 'GST %' }, { key: 'invoices', label: 'Invoices' }, { key: 'taxable', label: 'Taxable' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' }])}><Download className="h-4 w-4" /> CSV</button>
        </div>
        <table className="w-full min-w-[600px]">
          <thead><tr><th className="th">Type</th><th className="th text-right">GST %</th><th className="th text-right">Taxable</th><th className="th text-right">CGST</th><th className="th text-right">SGST</th><th className="th text-right">IGST</th></tr></thead>
          <tbody>
            {byRate.map((r: any, i: number) => (
              <tr key={i}><td className="td">{r.kind}</td><td className="td text-right">{r.rate}%</td><td className="td text-right"><Money v={r.taxable} /></td><td className="td text-right"><Money v={r.intra_tax / 2} /></td><td className="td text-right"><Money v={r.intra_tax / 2} /></td><td className="td text-right"><Money v={r.igst} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-sm font-semibold">HSN summary</h3>
          <button className="btn-secondary btn-sm" onClick={() => downloadCsv(`hsn_${from}_${to}.csv`, hsn, [{ key: 'hsn', label: 'HSN' }, { key: 'unit', label: 'UQC' }, { key: 'qty', label: 'Qty' }, { key: 'rate', label: 'Rate %' }, { key: 'taxable', label: 'Taxable' }, { key: 'tax', label: 'Tax' }, { key: 'total', label: 'Total' }])}><Download className="h-4 w-4" /> CSV</button>
        </div>
        <table className="w-full min-w-[600px]">
          <thead><tr><th className="th">HSN</th><th className="th">Unit</th><th className="th text-right">Qty</th><th className="th text-right">Rate</th><th className="th text-right">Taxable</th><th className="th text-right">Tax</th><th className="th text-right">Total</th></tr></thead>
          <tbody>
            {hsn.map((r: any, i: number) => (
              <tr key={i}><td className="td">{r.hsn}</td><td className="td">{r.unit}</td><td className="td text-right">{r.qty}</td><td className="td text-right">{r.rate}%</td><td className="td text-right"><Money v={r.taxable} /></td><td className="td text-right"><Money v={r.tax} /></td><td className="td text-right"><Money v={r.total} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Outstanding() {
  const q = useQuery({ queryKey: ['rep-out'], queryFn: () => api.get<any[]>('/api/reports/outstanding') });
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  const sum = (k: string) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm">Total due <b className="text-red-600">{money(sum('balance'))}</b> from {rows.length} customer(s)</span>
        <button className="btn-secondary btn-sm" onClick={() => downloadCsv('outstanding.csv', rows, [{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Mobile' }, { key: 'invoices', label: 'Invoices' }, { key: 'd0_30', label: '0-30 days' }, { key: 'd31_60', label: '31-60' }, { key: 'd61_90', label: '61-90' }, { key: 'd90', label: '90+' }, { key: 'balance', label: 'Total' }])}><Download className="h-4 w-4" /> CSV</button>
      </div>
      <table className="w-full min-w-[700px]">
        <thead><tr><th className="th">Customer</th><th className="th text-right">0-30 days</th><th className="th text-right">31-60</th><th className="th text-right">61-90</th><th className="th text-right">90+</th><th className="th text-right">Total due</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.customerId}>
              <td className="td"><Link className="font-medium text-brand-700 hover:underline" to={`/customers/${r.customerId}`}>{r.name}</Link><div className="text-[11px] text-slate-500">{r.invoices} invoice(s) {r.phone && `· ${r.phone}`}</div></td>
              <td className="td text-right"><Money v={r.d0_30} /></td><td className="td text-right"><Money v={r.d31_60} /></td><td className="td text-right"><Money v={r.d61_90} className={r.d61_90 ? 'text-amber-700' : ''} /></td><td className="td text-right"><Money v={r.d90} className={r.d90 ? 'text-red-600' : ''} /></td>
              <td className="td text-right font-bold"><Money v={r.balance} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="p-8 text-center text-sm text-slate-500">No pending dues 🎉</div>}
    </div>
  );
}
