import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { GST_RATES, formatInvoiceNo, todayIST } from '@gst/shared';
import { useSave } from '@/lib/api';
import { useInvoiceSettings } from '@/lib/hooks';
import { Field, Loading, PageHeader, Spinner, Switch } from '@/components/ui';

export default function InvoiceSettings() {
  const q = useInvoiceSettings();
  const [f, setF] = useState<any>(null);
  const save = useSave({ invalidate: ['invoice-settings'], success: 'Invoice settings saved' });
  useEffect(() => {
    if (q.data) setF(q.data);
  }, [q.data]);
  if (!f) return <Loading />;
  const set = (k: string, v: unknown) => setF((p: any) => ({ ...p, [k]: v }));
  const fields: any[] = f.customFields ?? [];
  return (
    <div className="max-w-3xl">
      <PageHeader title="Invoice Settings" subtitle="Numbering, defaults and extra fields" actions={<button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ method: 'put', url: '/api/settings/invoice', body: f })}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>} />
      <div className="space-y-4">
        <div className="card grid gap-3 p-4 sm:grid-cols-3">
          <h3 className="text-sm font-semibold sm:col-span-3">Invoice numbering</h3>
          <Field label="Prefix" hint="{FY} = 2026-27, {YY}, {YYYY}, {MM}"><input className="input" value={f.prefix} onChange={(e) => set('prefix', e.target.value)} /></Field>
          <Field label="Next number"><input className="input" type="number" min={1} value={f.nextNumber} onChange={(e) => set('nextNumber', Number(e.target.value))} /></Field>
          <Field label="Digits"><input className="input" type="number" min={1} max={8} value={f.padding} onChange={(e) => set('padding', Number(e.target.value))} /></Field>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-3">Next invoice: <b>{formatInvoiceNo(f.prefix, f.nextNumber, f.padding, todayIST())}</b></div>
          <div className="sm:col-span-3"><Switch checked={f.resetEveryFY} onChange={(v) => set('resetEveryFY', v)} label="Restart from 1 every financial year (1 April)" /></div>
        </div>
        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="text-sm font-semibold sm:col-span-2">Defaults</h3>
          <Field label="Payment due after (days)"><input className="input" type="number" min={0} value={f.dueDays} onChange={(e) => set('dueDays', Number(e.target.value))} /></Field>
          <Field label="Default GST rate">
            <select className="input" value={f.defaultGstRate} onChange={(e) => set('defaultGstRate', Number(e.target.value))}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </Field>
          <Switch checked={f.roundOff} onChange={(v) => set('roundOff', v)} label="Round off total to nearest rupee" />
          <Switch checked={f.priceIncludesTax} onChange={(v) => set('priceIncludesTax', v)} label="Rates include GST by default" hint="Common for retail / MRP pricing" />
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold">Extra invoice fields</h3>
          <p className="mb-3 text-xs text-slate-500">Shown on the invoice form and printed in the invoice header (e.g. PO No, Vehicle No, E-Way Bill).</p>
          <div className="space-y-2">
            {fields.map((cf, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input" value={cf.label} onChange={(e) => set('customFields', fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Switch checked={cf.enabled} onChange={(v) => set('customFields', fields.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} />
                <button className="rounded p-2 text-slate-400 hover:text-red-600" onClick={() => set('customFields', fields.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {fields.length < 8 && (
            <button className="btn-secondary btn-sm mt-3" onClick={() => set('customFields', [...fields, { key: `f_${Date.now().toString(36)}`, label: 'New field', enabled: true }])}><Plus className="h-4 w-4" /> Add field</button>
          )}
        </div>
      </div>
    </div>
  );
}
