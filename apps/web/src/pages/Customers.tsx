import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, MessageCircle, Pencil, Phone, Plus, Users } from 'lucide-react';
import { fmtDate, money, stateName, waNumber } from '@gst/shared';
import { api } from '@/lib/api';
import { useCustomers, type Customer } from '@/lib/hooks';
import { downloadCsv } from '@/lib/pdf';
import { CustomerForm } from '@/components/MasterForms';
import { Badge, Empty, Loading, Money, PageHeader, SearchBox, Switch } from '@/components/ui';

export default function Customers() {
  const [all, setAll] = useState(false);
  const list = useCustomers(all);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ open: boolean; c?: Customer | null }>({ open: false });
  const nav = useNavigate();
  const rows = (list.data ?? []).filter((c) => !q || `${c.name} ${c.phone} ${c.gstin} ${c.city}`.toLowerCase().includes(q.toLowerCase()));
  const totalDue = rows.reduce((s, c) => s + (c.outstanding ?? 0), 0);
  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${rows.length} customer(s) · outstanding ${money(totalDue)}`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => downloadCsv('customers.csv', rows as any, [{ key: 'name', label: 'Name' }, { key: 'gstin', label: 'GSTIN' }, { key: 'phone', label: 'Mobile' }, { key: 'email', label: 'Email' }, { key: 'city', label: 'City' }, { key: 'outstanding', label: 'Outstanding' }])}>
              <Download className="h-4 w-4" />
            </button>
            <button className="btn-primary" onClick={() => setEdit({ open: true, c: null })}><Plus className="h-4 w-4" /> Add</button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Name, mobile, GSTIN, city" className="w-full sm:w-80" />
        <Switch checked={all} onChange={setAll} label={<span className="text-xs">Show inactive</span>} />
      </div>
      {list.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <div className="card"><Empty icon={<Users className="h-10 w-10" />} title="No customers" action={<button className="btn-primary" onClick={() => setEdit({ open: true, c: null })}><Plus className="h-4 w-4" /> Add customer</button>} /></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50 sm:px-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => nav(`/customers/${c.id}`)}>
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{c.name}</span>
                  {!c.isActive && <Badge>inactive</Badge>}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {c.gstin || 'Unregistered'} · {stateName(c.stateCode) || '—'}{c.city && ` · ${c.city}`}{c.phone && ` · ${c.phone}`}
                </div>
              </button>
              <div className="text-right">
                <Money v={c.outstanding} className={(c.outstanding ?? 0) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'} />
                <div className="text-[11px] text-slate-500">{c.invoiceCount} inv.</div>
              </div>
              <div className="flex">
                {c.phone && <a className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" href={`tel:${c.phone}`} aria-label="Call"><Phone className="h-4 w-4" /></a>}
                <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEdit({ open: true, c })} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <CustomerForm open={edit.open} customer={edit.c} onClose={() => setEdit({ open: false })} />
    </div>
  );
}

export function CustomerLedger() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['ledger', id], queryFn: () => api.get<any>(`/api/customers/${id}/ledger`) });
  const [edit, setEdit] = useState(false);
  if (q.isLoading || !q.data) return <Loading />;
  const { customer: c, entries, opening, closing } = q.data;
  const wa = waNumber(c.phone);
  const stmt = `Dear ${c.name},\n\nYour current outstanding balance with us is *${money(closing)}*.\n\nPlease arrange the payment at the earliest. Thank you!`;
  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={<>{c.gstin || 'Unregistered'} · {stateName(c.stateCode)} {c.phone && `· ${c.phone}`}</>}
        actions={
          <>
            {wa && closing > 0 && <a className="btn-wa" target="_blank" rel="noreferrer" href={`https://wa.me/${wa}?text=${encodeURIComponent(stmt)}`}><MessageCircle className="h-4 w-4" /> Remind</a>}
            <button className="btn-secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</button>
            <Link className="btn-primary" to="/invoices/new"><Plus className="h-4 w-4" /> Invoice</Link>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-3"><div className="text-xs text-slate-500">Opening</div><Money v={opening} className="text-lg font-bold" /></div>
        <div className="card p-3"><div className="text-xs text-slate-500">Closing balance</div><Money v={closing} className={`text-lg font-bold ${closing > 0 ? 'text-red-600' : ''}`} /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead><tr><th className="th">Date</th><th className="th">Particulars</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th><th className="th text-right">Balance</th></tr></thead>
          <tbody>
            <tr><td className="td text-slate-500" colSpan={4}>Opening balance</td><td className="td text-right"><Money v={opening} /></td></tr>
            {entries.map((e: any, i: number) => (
              <tr key={i}>
                <td className="td whitespace-nowrap">{fmtDate(e.date)}</td>
                <td className="td">
                  <Link to={`/invoices/${e.refId}`} className="font-medium text-brand-700 hover:underline">{e.type} · {e.ref}</Link>
                  {e.note && <div className="text-[11px] capitalize text-slate-500">{e.note}</div>}
                </td>
                <td className="td text-right">{e.debit ? <Money v={e.debit} /> : ''}</td>
                <td className="td text-right text-green-700">{e.credit ? <Money v={e.credit} /> : ''}</td>
                <td className="td text-right font-semibold"><Money v={e.balance} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <div className="p-6 text-center text-sm text-slate-500">No transactions yet</div>}
      </div>
      <CustomerForm open={edit} customer={c} onClose={() => setEdit(false)} onSaved={() => q.refetch()} />
    </div>
  );
}
