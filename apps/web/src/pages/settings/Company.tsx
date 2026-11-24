import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Save, X } from 'lucide-react';
import { GSTIN_RE, STATES, stateFromGstin } from '@gst/shared';
import { api, errText } from '@/lib/api';
import { useCompany } from '@/lib/hooks';
import { fileToDataUrl } from '@/lib/pdf';
import { toast, useAuth } from '@/lib/store';
import { Field, Loading, PageHeader, Spinner } from '@/components/ui';

export default function Company() {
  const q = useCompany();
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setF(q.data as Record<string, string>);
  }, [q.data]);
  if (q.isLoading) return <Loading />;
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const img = async (k: 'logo' | 'signature', file?: File) => {
    if (!file) return;
    try {
      set(k, await fileToDataUrl(file, k === 'logo' ? 400 : 360));
    } catch {
      toast.error('Could not read that image');
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/api/settings/company', f);
      qc.invalidateQueries({ queryKey: ['company'] });
      const me = await api.get<any>('/api/auth/me');
      useAuth.getState().setSession(me);
      toast.success('Company details saved');
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const gstBad = !!f.gstin && !GSTIN_RE.test(f.gstin);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Company" subtitle="Printed on every invoice" actions={<button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>} />
      <div className="space-y-4">
        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Business name" required><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Legal name (if different)"><input className="input" value={f.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} /></Field>
          <Field label="GSTIN" hint={gstBad ? <span className="text-amber-600">GSTIN format looks wrong</span> : 'Leave blank if not registered'}>
            <input className="input uppercase" maxLength={15} value={f.gstin ?? ''} onChange={(e) => { const g = e.target.value.toUpperCase(); setF((p) => ({ ...p, gstin: g, stateCode: stateFromGstin(g) || p.stateCode, pan: g.length >= 12 ? g.slice(2, 12) : p.pan })); }} />
          </Field>
          <Field label="PAN"><input className="input uppercase" maxLength={10} value={f.pan ?? ''} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></Field>
          <Field label="State" required hint="Decides CGST+SGST vs IGST">
            <select className="input" value={f.stateCode ?? ''} onChange={(e) => set('stateCode', e.target.value)}>
              <option value="">Select state</option>
              {STATES.map((s) => <option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}
            </select>
          </Field>
          <Field label="City"><input className="input" value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Pincode"><input className="input" value={f.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email" className="sm:col-span-2"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>

        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          {(['logo', 'signature'] as const).map((k) => (
            <div key={k}>
              <div className="label">{k === 'logo' ? 'Logo' : 'Signature / stamp'}</div>
              <div className="flex items-center gap-3">
                <div className="flex h-20 w-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                  {f[k] ? <img src={f[k]} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-slate-300" />}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="btn-secondary btn-sm cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={(e) => img(k, e.target.files?.[0])} /></label>
                  {f[k] && <button className="btn-ghost btn-sm text-red-600" onClick={() => set(k, '')}><X className="h-3 w-3" /> Remove</button>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card grid gap-3 p-4 sm:grid-cols-2">
          <h3 className="text-sm font-semibold sm:col-span-2">Bank & UPI (for payment)</h3>
          <Field label="Account name"><input className="input" value={f.accountName ?? ''} onChange={(e) => set('accountName', e.target.value)} /></Field>
          <Field label="Bank name"><input className="input" value={f.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} /></Field>
          <Field label="Account number"><input className="input" value={f.accountNo ?? ''} onChange={(e) => set('accountNo', e.target.value)} /></Field>
          <Field label="IFSC"><input className="input uppercase" value={f.ifsc ?? ''} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></Field>
          <Field label="Branch"><input className="input" value={f.branch ?? ''} onChange={(e) => set('branch', e.target.value)} /></Field>
          <Field label="UPI ID" hint="A 'Scan & Pay' QR with the due amount prints on the invoice"><input className="input" placeholder="name@bank" value={f.upiId ?? ''} onChange={(e) => set('upiId', e.target.value.trim())} /></Field>
        </div>

        <div className="card p-4">
          <Field label="Terms & conditions (printed)"><textarea className="input" rows={4} value={f.terms ?? ''} onChange={(e) => set('terms', e.target.value)} /></Field>
        </div>
      </div>
    </div>
  );
}
