import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { GST_RATES, PAYMENT_MODES, STATES, addDays, calcInvoice, money, stateName, todayIST } from '@gst/shared';
import { api, errText } from '@/lib/api';
import { useCompany, useCustomers, useInvoiceSettings, useItems, type Customer, type Item } from '@/lib/hooks';
import { toast } from '@/lib/store';
import { CustomerForm, ItemForm } from '@/components/MasterForms';
import { Combo, Field, Loading, Spinner, Switch, cx } from '@/components/ui';

interface Line {
  key: string;
  itemId: string | null;
  name: string;
  description: string;
  hsn: string;
  unit: string;
  qty: string;
  rate: string;
  discountPct: string;
  gstRate: number;
}
const newKey = () => Math.random().toString(36).slice(2);
const blankLine = (gst = 18): Line => ({ key: newKey(), itemId: null, name: '', description: '', hsn: '', unit: '', qty: '1', rate: '', discountPct: '', gstRate: gst });

export default function InvoiceForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const customers = useCustomers();
  const items = useItems();
  const company = useCompany();
  const settings = useInvoiceSettings();
  const existing = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<any>(`/api/invoices/${id}`), enabled: editing });

  const today = todayIST();
  const [h, setH] = useState({ invoiceNo: '', invoiceDate: today, dueDate: '', customerId: '', placeOfSupply: '', priceIncludesTax: false, discount: '', notes: '', shipTo: '', extra: {} as Record<string, string> });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [pay, setPay] = useState({ amount: '', mode: 'Cash', reference: '' });
  const [showMore, setShowMore] = useState(false);
  const [nextNo, setNextNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [custModal, setCustModal] = useState<{ open: boolean; name?: string }>({ open: false });
  const [itemModal, setItemModal] = useState<{ open: boolean; name?: string; lineKey?: string }>({ open: false });
  const [ready, setReady] = useState(false);

  // initial values
  useEffect(() => {
    if (ready) return;
    if (editing) {
      const inv = existing.data;
      if (!inv) return;
      setH({
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate ?? '',
        customerId: inv.customerId,
        placeOfSupply: inv.placeOfSupply,
        priceIncludesTax: inv.priceIncludesTax,
        discount: inv.discount ? String(inv.discount) : '',
        notes: inv.notes,
        shipTo: inv.shipTo,
        extra: inv.extra ?? {},
      });
      setLines(inv.lines.map((l: any) => ({ key: newKey(), itemId: l.itemId, name: l.name, description: l.description, hsn: l.hsn, unit: l.unit, qty: String(l.qty), rate: String(l.rate), discountPct: l.discountPct ? String(l.discountPct) : '', gstRate: l.gstRate })));
      setShowMore(Boolean(inv.notes || inv.shipTo || inv.discount || Object.values(inv.extra ?? {}).some(Boolean)));
      setReady(true);
    } else if (settings.data) {
      const s = settings.data;
      setH((p) => ({ ...p, dueDate: s.dueDays ? addDays(today, s.dueDays) : '', priceIncludesTax: s.priceIncludesTax }));
      setLines([blankLine(s.defaultGstRate)]);
      setReady(true);
    }
  }, [editing, existing.data, settings.data, ready, today]);

  useEffect(() => {
    if (editing) return;
    api.get<{ invoiceNo: string }>(`/api/invoices/next-no?date=${h.invoiceDate}`).then((r) => setNextNo(r.invoiceNo)).catch(() => undefined);
  }, [h.invoiceDate, editing]);

  const sellerState = company.data?.stateCode ?? '';
  const customer = customers.data?.find((c) => c.id === h.customerId) ?? (editing && existing.data ? { ...existing.data.customer, id: existing.data.customerId } : undefined);
  const interstate = Boolean(sellerState && h.placeOfSupply && h.placeOfSupply !== sellerState);
  const calc = useMemo(
    () =>
      calcInvoice(
        lines.map((l) => ({ qty: Number(l.qty) || 0, rate: Number(l.rate) || 0, discountPct: Number(l.discountPct) || 0, gstRate: l.gstRate })),
        { discount: Number(h.discount) || 0, priceIncludesTax: h.priceIncludesTax, interstate, roundOff: settings.data?.roundOff ?? true },
      ),
    [lines, h.discount, h.priceIncludesTax, interstate, settings.data?.roundOff],
  );

  const pickCustomer = (c: Customer) => setH((p) => ({ ...p, customerId: c.id, placeOfSupply: c.stateCode || sellerState }));
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key: string, it: Item) => setLine(key, { itemId: it.id, name: it.name, description: it.description, hsn: it.hsn, unit: it.unit, rate: String(it.rate), gstRate: it.gstRate });
  const customFields = (settings.data?.customFields ?? []).filter((f: any) => f.enabled || h.extra[f.key]);

  const save = async () => {
    if (!h.customerId) return toast.error('Select a customer');
    const valid = lines.filter((l) => l.name.trim());
    if (!valid.length) return toast.error('Add at least one item');
    if (valid.some((l) => !(Number(l.qty) > 0))) return toast.error('Qty must be more than 0');
    setSaving(true);
    try {
      const body = {
        ...h,
        invoiceNo: h.invoiceNo.trim(),
        dueDate: h.dueDate || null,
        discount: Number(h.discount) || 0,
        placeOfSupply: h.placeOfSupply || sellerState,
        lines: valid.map((l) => ({ itemId: l.itemId, name: l.name.trim(), description: l.description, hsn: l.hsn, unit: l.unit, qty: Number(l.qty), rate: Number(l.rate) || 0, discountPct: Number(l.discountPct) || 0, gstRate: l.gstRate })),
        payment: !editing && Number(pay.amount) > 0 ? { amount: Number(pay.amount), mode: pay.mode, reference: pay.reference } : null,
      };
      const r = editing ? await api.put<any>(`/api/invoices/${id}`, body) : await api.post<any>('/api/invoices', body);
      ['invoices', 'invoice', 'dashboard', 'customers', 'payments', 'ledger'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(editing ? 'Invoice updated' : `Invoice ${r.invoiceNo} saved`);
      if (r.autoWhatsapp && r.autoWhatsapp !== 'queued') toast.error(`WhatsApp: ${r.autoWhatsapp}`);
      nav(`/invoices/${r.id}${editing ? '' : '?created=1'}`, { replace: true });
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!ready || customers.isLoading || items.isLoading || company.isLoading) return <Loading />;

  return (
    <div className="pb-24 lg:pb-0">
      {!sellerState && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Set your business state in Settings → Company first, so GST is split correctly.</div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="card p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Invoice No" className="col-span-2 sm:col-span-1" hint={!editing && !h.invoiceNo ? `Auto: ${nextNo}` : undefined}>
                <input className="input" value={h.invoiceNo} placeholder={nextNo || 'Auto'} onChange={(e) => setH({ ...h, invoiceNo: e.target.value })} />
              </Field>
              <Field label="Invoice Date">
                <input
                  className="input"
                  type="date"
                  value={h.invoiceDate}
                  onChange={(e) => {
                    const d = e.target.value;
                    setH((p) => ({ ...p, invoiceDate: d, dueDate: !editing && settings.data?.dueDays ? addDays(d, settings.data.dueDays) : p.dueDate }));
                  }}
                />
              </Field>
              <Field label="Due Date">
                <input className="input" type="date" value={h.dueDate} onChange={(e) => setH({ ...h, dueDate: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Customer" required className="sm:col-span-2">
                <Combo
                  items={customers.data ?? []}
                  value={customer?.name ?? ''}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.name}
                  renderItem={(c) => (
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 text-xs text-slate-500">{c.gstin || c.phone || c.city}</span>
                    </div>
                  )}
                  onSelect={pickCustomer}
                  placeholder="Search or add customer"
                  onCreate={(t) => setCustModal({ open: true, name: t })}
                  createLabel="Add customer"
                />
              </Field>
              <Field label="Place of Supply">
                <select className="input" value={h.placeOfSupply || sellerState} onChange={(e) => setH({ ...h, placeOfSupply: e.target.value })}>
                  <option value="">Select</option>
                  {STATES.map((s) => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
                </select>
              </Field>
            </div>
            {customer && (
              <div className="mt-2 text-xs text-slate-500">
                {customer.gstin ? `GSTIN ${customer.gstin}` : 'Unregistered (B2C)'} · {stateName(customer.stateCode) || 'state not set'}
                {customer.phone && ` · ${customer.phone}`} · <b className={interstate ? 'text-purple-700' : 'text-brand-700'}>{interstate ? 'IGST (inter-state)' : 'CGST + SGST'}</b>
              </div>
            )}
          </div>

          <div className="card p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Items</h3>
              <Switch checked={h.priceIncludesTax} onChange={(v) => setH({ ...h, priceIncludesTax: v })} label={<span className="text-xs">Rates include GST</span>} />
            </div>
            <div className="hidden grid-cols-[minmax(0,2.6fr)_.8fr_1fr_.7fr_.8fr_1fr_32px] gap-2 px-1 pb-1 text-[11px] font-semibold uppercase text-slate-500 md:grid">
              <span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Disc %</span><span>GST</span><span className="text-right">Amount</span><span />
            </div>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={l.key} className="rounded-lg border border-line p-2 md:grid md:grid-cols-[minmax(0,2.6fr)_.8fr_1fr_.7fr_.8fr_1fr_32px] md:items-start md:gap-2 md:border-0 md:p-0">
                  <div className="mb-2 md:mb-0">
                    <Combo
                      items={items.data ?? []}
                      value={l.name}
                      getKey={(i) => i.id}
                      getLabel={(i) => i.name}
                      renderItem={(i) => (
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{i.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">{money(i.rate)} · {i.gstRate}%</span>
                        </div>
                      )}
                      onSelect={(i) => pickItem(l.key, i)}
                      onTextChange={(t) => setLine(l.key, { name: t, itemId: null })}
                      placeholder={`Item ${idx + 1}`}
                      onCreate={(t) => setItemModal({ open: true, name: t, lineKey: l.key })}
                      createLabel="Save as new item"
                    />
                    {(l.hsn || l.unit) && <div className="mt-0.5 px-1 text-[11px] text-slate-500">{l.hsn && `HSN ${l.hsn}`} {l.unit}</div>}
                  </div>
                  <div className="grid grid-cols-4 gap-2 md:contents">
                    <label className="md:block"><span className="label md:hidden">Qty</span><input className="input text-right" type="number" inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></label>
                    <label><span className="label md:hidden">Rate</span><input className="input text-right" type="number" inputMode="decimal" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} /></label>
                    <label><span className="label md:hidden">Disc %</span><input className="input text-right" type="number" inputMode="decimal" value={l.discountPct} placeholder="0" onChange={(e) => setLine(l.key, { discountPct: e.target.value })} /></label>
                    <label>
                      <span className="label md:hidden">GST</span>
                      <select className="input px-2" value={l.gstRate} onChange={(e) => setLine(l.key, { gstRate: Number(e.target.value) })}>
                        {[...new Set([...GST_RATES, l.gstRate])].map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 flex items-center justify-between md:mt-0 md:contents">
                    <div className="text-sm font-semibold tabular-nums md:py-2 md:text-right">{money(calc.lines[idx]?.total ?? 0)}</div>
                    <button className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-secondary mt-3 w-full sm:w-auto" onClick={() => setLines((ls) => [...ls, blankLine(settings.data?.defaultGstRate ?? 18)])}>
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>

          <div className="card p-4">
            <button className="text-sm font-semibold text-brand-700" onClick={() => setShowMore(!showMore)}>
              {showMore ? '− Hide' : '+ Add'} discount, notes, shipping {customFields.length ? `& ${customFields.map((f: any) => f.label).join(', ')}` : ''}
            </button>
            {showMore && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Extra discount on bill (₹)">
                  <input className="input" type="number" inputMode="decimal" value={h.discount} onChange={(e) => setH({ ...h, discount: e.target.value })} />
                </Field>
                {customFields.map((f: any) => (
                  <Field key={f.key} label={f.label}>
                    <input className="input" value={h.extra[f.key] ?? ''} onChange={(e) => setH({ ...h, extra: { ...h.extra, [f.key]: e.target.value } })} />
                  </Field>
                ))}
                <Field label="Ship to (if different)" className="sm:col-span-2">
                  <textarea className="input" rows={2} value={h.shipTo} onChange={(e) => setH({ ...h, shipTo: e.target.value })} />
                </Field>
                <Field label="Notes (printed on invoice)" className="sm:col-span-2">
                  <textarea className="input" rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Summary</h3>
            <div className="space-y-1.5 text-sm">
              <Row k="Sub total" v={money(calc.subtotal)} />
              {calc.discount > 0 && <Row k="Discount" v={`- ${money(calc.discount)}`} />}
              <Row k="Taxable amount" v={money(calc.taxable)} />
              {interstate ? <Row k="IGST" v={money(calc.igst)} /> : (<><Row k="CGST" v={money(calc.cgst)} /><Row k="SGST" v={money(calc.sgst)} /></>)}
              {Math.abs(calc.roundOff) > 0.004 && <Row k="Round off" v={money(calc.roundOff)} />}
              <div className="flex justify-between border-t border-line pt-2 text-lg font-extrabold">
                <span>Total</span>
                <span className="tabular-nums">{money(calc.total)}</span>
              </div>
            </div>
            {!editing && (
              <div className="mt-4 space-y-2 border-t border-line pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Payment received now</span>
                  <button className="text-xs font-semibold text-brand-700" onClick={() => setPay({ ...pay, amount: String(calc.total) })}>Full amount</button>
                </div>
                <input className="input" type="number" inputMode="decimal" placeholder="0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                {Number(pay.amount) > 0 && (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {PAYMENT_MODES.map((m) => (
                        <button key={m} type="button" onClick={() => setPay({ ...pay, mode: m })} className={cx('btn-sm', pay.mode === m ? 'btn-primary' : 'btn-secondary')}>{m}</button>
                      ))}
                    </div>
                    <input className="input" placeholder="Reference (optional)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                    <div className="flex justify-between text-sm"><span>Balance</span><b className="tabular-nums">{money(Math.max(0, calc.total - Number(pay.amount)))}</b></div>
                  </>
                )}
              </div>
            )}
            <button className="btn-primary mt-4 hidden w-full py-2.5 lg:flex" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : <Save className="h-4 w-4" />} {editing ? 'Update invoice' : 'Save invoice'}
            </button>
          </div>
        </div>
      </div>

      {/* sticky save bar on mobile */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden">
        <div className="flex-1">
          <div className="text-[11px] text-slate-500">Total</div>
          <div className="text-lg font-extrabold tabular-nums">{money(calc.total)}</div>
        </div>
        <button className="btn-primary px-6 py-3" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Save className="h-4 w-4" />} {editing ? 'Update' : 'Save'}
        </button>
      </div>

      <CustomerForm open={custModal.open} initialName={custModal.name} defaultState={sellerState} onClose={() => setCustModal({ open: false })} onSaved={pickCustomer} />
      <ItemForm
        open={itemModal.open}
        initialName={itemModal.name}
        defaultGst={settings.data?.defaultGstRate}
        onClose={() => setItemModal({ open: false })}
        onSaved={(it) => itemModal.lineKey && pickItem(itemModal.lineKey, it)}
      />
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between text-slate-600">
    <span>{k}</span>
    <span className="tabular-nums text-slate-800">{v}</span>
  </div>
);
