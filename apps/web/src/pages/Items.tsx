import { useState } from 'react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { money } from '@gst/shared';
import { useSave } from '@/lib/api';
import { useInvoiceSettings, useItems, type Item } from '@/lib/hooks';
import { ItemForm } from '@/components/MasterForms';
import { Badge, Confirm, Empty, Loading, PageHeader, SearchBox, Switch } from '@/components/ui';

export default function Items() {
  const [all, setAll] = useState(false);
  const list = useItems(all);
  const settings = useInvoiceSettings();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ open: boolean; i?: Item | null }>({ open: false });
  const [del, setDel] = useState<Item | null>(null);
  const remove = useSave({ invalidate: ['items'], success: 'Item deleted', onSuccess: () => setDel(null) });
  const rows = (list.data ?? []).filter((i) => !q || `${i.name} ${i.hsn}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Items" subtitle="Products and services" actions={<button className="btn-primary" onClick={() => setEdit({ open: true, i: null })}><Plus className="h-4 w-4" /> Add</button>} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Name or HSN" className="w-full sm:w-72" />
        <Switch checked={all} onChange={setAll} label={<span className="text-xs">Show inactive</span>} />
      </div>
      {list.isLoading ? (
        <Loading />
      ) : !rows.length ? (
        <div className="card"><Empty icon={<Package className="h-10 w-10" />} title="No items" text="Add the products / services you sell, with HSN and GST rate. You can also type a new item directly on the invoice." /></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {rows.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-semibold">{i.name}</span>{!i.isActive && <Badge>inactive</Badge>}</div>
                <div className="text-xs text-slate-500">HSN {i.hsn || '—'} · {i.unit || '—'} · GST {i.gstRate}%</div>
              </div>
              <div className="text-right font-semibold tabular-nums">{money(i.rate)}</div>
              <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEdit({ open: true, i })} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setDel(i)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <ItemForm open={edit.open} item={edit.i} defaultGst={settings.data?.defaultGstRate} onClose={() => setEdit({ open: false })} />
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete item?" text={`“${del?.name}” will be removed. Items already used in invoices can only be marked inactive.`} danger confirmText="Delete" busy={remove.isPending} onConfirm={() => del && remove.mutate({ method: 'del', url: `/api/items/${del.id}` })} />
    </div>
  );
}
