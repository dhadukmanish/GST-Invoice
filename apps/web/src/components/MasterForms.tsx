import { useEffect, useState } from 'react';
import { GST_RATES, GSTIN_RE, STATES, UNITS, stateFromGstin } from '@gst/shared';
import { useSave } from '@/lib/api';
import type { Customer, Item } from '@/lib/hooks';
import { Field, Modal, Spinner, Switch } from './ui';

const emptyCustomer = (name = '', stateCode = ''): Partial<Customer> => ({ name, gstin: '', stateCode, phone: '', email: '', address: '', city: '', pincode: '', openingBalance: 0, notes: '', isActive: true });

export function CustomerForm({ open, onClose, customer, initialName, defaultState, onSaved }: { open: boolean; onClose: () => void; customer?: Customer | null; initialName?: string; defaultState?: string; onSaved?: (c: Customer) => void }) {
  const [f, setF] = useState<Partial<Customer>>(emptyCustomer());
  useEffect(() => {
    if (open) setF(customer ? { ...customer } : emptyCustomer(initialName ?? '', defaultState ?? ''));
  }, [open, customer, initialName, defaultState]);
  const save = useSave<Customer>({ invalidate: ['customers'], success: customer ? 'Customer updated' : 'Customer added', onSuccess: (c) => { onSaved?.(c); onClose(); } });
  const set = (k: keyof Customer, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const gstinBad = !!f.gstin && !GSTIN_RE.test(f.gstin.toUpperCase());
  const submit = () => save.mutate({ method: customer ? 'put' : 'post', url: customer ? `/api/customers/${customer.id}` : '/api/customers', body: f });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? 'Edit Customer' : 'Add Customer'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={save.isPending || !f.name?.trim()}>
            {save.isPending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Customer / Business name" required className="sm:col-span-2">
          <input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="GSTIN" hint={gstinBad ? <span className="text-amber-600">GSTIN format looks wrong — check it</span> : 'Leave blank for unregistered (B2C)'}>
          <input
            className="input uppercase"
            value={f.gstin ?? ''}
            maxLength={15}
            onChange={(e) => {
              const g = e.target.value.toUpperCase();
              setF((p) => ({ ...p, gstin: g, stateCode: stateFromGstin(g) || p.stateCode }));
            }}
          />
        </Field>
        <Field label="State (place of supply)">
          <select className="input" value={f.stateCode ?? ''} onChange={(e) => set('stateCode', e.target.value)}>
            <option value="">Select state</option>
            {STATES.map((s) => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
          </select>
        </Field>
        <Field label="Mobile (WhatsApp)">
          <input className="input" inputMode="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="98250 12345" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <textarea className="input" rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="City">
          <input className="input" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Pincode">
          <input className="input" inputMode="numeric" value={f.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} />
        </Field>
        <Field label="Opening balance (₹ receivable)" hint="Old dues before using this software">
          <input className="input" type="number" inputMode="decimal" value={f.openingBalance ?? 0} onChange={(e) => set('openingBalance', e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Switch checked={f.isActive !== false} onChange={(v) => set('isActive', v)} label="Active" />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function ItemForm({ open, onClose, item, initialName, defaultGst = 18, onSaved }: { open: boolean; onClose: () => void; item?: Item | null; initialName?: string; defaultGst?: number; onSaved?: (i: Item) => void }) {
  const [f, setF] = useState<Partial<Item>>({});
  useEffect(() => {
    if (open) setF(item ? { ...item } : { name: initialName ?? '', description: '', hsn: '', unit: 'PCS', rate: 0, gstRate: defaultGst, isActive: true });
  }, [open, item, initialName, defaultGst]);
  const save = useSave<Item>({ invalidate: ['items'], success: item ? 'Item updated' : 'Item added', onSuccess: (i) => { onSaved?.(i); onClose(); } });
  const set = (k: keyof Item, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => save.mutate({ method: item ? 'put' : 'post', url: item ? `/api/items/${item.id}` : '/api/items', body: f });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Edit Item' : 'Add Item'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={save.isPending || !f.name?.trim()}>
            {save.isPending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Item / Service name" required className="col-span-2">
          <input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="HSN / SAC">
          <input className="input" inputMode="numeric" value={f.hsn ?? ''} onChange={(e) => set('hsn', e.target.value)} />
        </Field>
        <Field label="Unit">
          <input className="input uppercase" list="units" value={f.unit ?? ''} onChange={(e) => set('unit', e.target.value.toUpperCase())} />
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="Sale rate (₹)">
          <input className="input" type="number" inputMode="decimal" value={f.rate ?? 0} onChange={(e) => set('rate', e.target.value)} />
        </Field>
        <Field label="GST %">
          <select className="input" value={f.gstRate ?? 18} onChange={(e) => set('gstRate', Number(e.target.value))}>
            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <Field label="Description (optional)" className="col-span-2">
          <input className="input" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Switch checked={f.isActive !== false} onChange={(v) => set('isActive', v)} label="Active" />
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
