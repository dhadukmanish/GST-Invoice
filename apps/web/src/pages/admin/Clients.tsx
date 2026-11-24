import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessageCircle, Plus, RefreshCw, Send } from 'lucide-react';
import { STATES, addDays, fillTemplate, fmtDate, stateFromGstin, todayIST, waNumber } from '@gst/shared';
import { api, errText, qs } from '@/lib/api';
import { toast } from '@/lib/store';
import { Badge, Field, Loading, Modal, PageHeader, SearchBox, Spinner, Stat, Switch, Tabs } from '@/components/ui';

export const tenantState = (t: { status: string; daysLeft: number }) => (t.status === 'suspended' ? 'suspended' : t.daysLeft < 0 ? 'expired' : t.daysLeft <= 15 ? 'expiring' : 'active');

export default function Clients() {
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'active' | 'expiring' | 'expired' | 'suspended'>('all');
  const [q, setQ] = useState('');
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: () => api.get<any>('/api/admin/stats') });
  const list = useQuery({ queryKey: ['admin-tenants', filter, q], queryFn: () => api.get<any[]>(`/api/admin/tenants${qs({ filter, q })}`) });
  const [create, setCreate] = useState<any>(null);
  const s = stats.data;
  return (
    <div>
      <PageHeader title="Clients" subtitle="Create logins, set validity, manage accounts" actions={<button className="btn-primary" onClick={() => setCreate({})}><Plus className="h-4 w-4" /> New client</button>} />
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Total clients" value={s.total} />
          <Stat label="Active" value={s.active} tone="green" />
          <Stat label="Expiring ≤ 15 days" value={s.expiring} tone="amber" />
          <Stat label="Expired" value={s.expired} tone="red" />
          <Stat label="New requests" value={s.requests} sub={`${s.invoices} invoices in 30 days`} />
        </div>
      )}
      <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring' }, { value: 'expired', label: 'Expired' }, { value: 'suspended', label: 'Suspended' }]} />
      <SearchBox value={q} onChange={setQ} placeholder="Business, contact, mobile" className="mb-3 sm:w-80" />
      {list.isLoading ? (
        <Loading />
      ) : (
        <div className="card divide-y divide-slate-100">
          {(list.data ?? []).map((t) => (
            <button key={t.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => nav(`/admin/clients/${t.id}`)}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{t.businessName}</div>
                <div className="truncate text-xs text-slate-500">
                  {t.adminUsername} · {t.contactName || '—'} {t.phone && `· ${t.phone}`} · {t.users}/{t.maxUsers} users · {t.invoices} invoices
                </div>
              </div>
              <div className="text-right">
                <Badge status={tenantState(t)} />
                <div className="mt-0.5 text-[11px] text-slate-500">till {fmtDate(t.validUntil)} ({t.daysLeft}d)</div>
              </div>
            </button>
          ))}
          {!list.data?.length && <div className="p-8 text-center text-sm text-slate-500">No clients</div>}
        </div>
      )}
      <CreateClient open={!!create} prefill={create} onClose={() => setCreate(null)} />
    </div>
  );
}

export function CreateClient({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill?: any }) {
  const qc = useQueryClient();
  const platform = useQuery({ queryKey: ['platform'], queryFn: () => api.get<any>('/api/admin/platform'), enabled: open });
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ tenantId: string; username: string; password: string; phone: string; name: string; validUntil: string } | null>(null);

  const genPass = async () => (await api.get<{ password: string }>('/api/admin/gen-password')).password;
  useEffect(() => {
    if (!open) return;
    setCreds(null);
    const b = platform.data?.branding;
    const days = b?.defaultValidityDays ?? 30;
    const base = { businessName: prefill?.businessName ?? '', contactName: prefill?.name ?? '', phone: prefill?.phone ?? '', email: prefill?.email ?? '', stateCode: '', gstin: '', plan: '', validUntil: addDays(todayIST(), days), maxUsers: b?.defaultMaxUsers ?? 2, whatsappAllowed: true, notes: prefill?.message ?? '', username: '', password: '', adminName: prefill?.name ?? '', requestId: prefill?.id };
    setF(base);
    genPass().then((p) => setF((x: any) => ({ ...x, password: p }))).catch(() => undefined);
  }, [open, prefill, platform.data]);

  const set = (k: string, v: unknown) => setF((p: any) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    try {
      const t = await api.post<any>('/api/admin/tenants', { ...f, requestId: f.requestId || undefined });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-requests'] });
      setCreds({ tenantId: t.id, username: f.username, password: f.password, phone: f.phone, name: f.contactName || f.businessName, validUntil: f.validUntil });
      toast.success('Client created');
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (creds) return <CredentialsModal open={open} onClose={onClose} {...creds} />;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New client account"
      size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !f.businessName || !f.username || (f.password ?? '').length < 6} onClick={submit}>{busy && <Spinner />} Create account</button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name" required className="sm:col-span-2"><input className="input" value={f.businessName ?? ''} onChange={(e) => set('businessName', e.target.value)} /></Field>
        <Field label="Contact person"><input className="input" value={f.contactName ?? ''} onChange={(e) => { set('contactName', e.target.value); set('adminName', e.target.value); }} /></Field>
        <Field label="Mobile (WhatsApp)"><input className="input" inputMode="tel" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="GSTIN"><input className="input uppercase" maxLength={15} value={f.gstin ?? ''} onChange={(e) => { const g = e.target.value.toUpperCase(); setF((p: any) => ({ ...p, gstin: g, stateCode: stateFromGstin(g) || p.stateCode })); }} /></Field>
        <Field label="State">
          <select className="input" value={f.stateCode ?? ''} onChange={(e) => set('stateCode', e.target.value)}><option value="">Select</option>{STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
        </Field>
        <Field label="Email"><input className="input" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Plan / price note"><input className="input" placeholder="e.g. Yearly ₹999" value={f.plan ?? ''} onChange={(e) => set('plan', e.target.value)} /></Field>
        <div className="rounded-xl bg-brand-50 p-3 sm:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Login username" required><input className="input" autoCapitalize="none" value={f.username ?? ''} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="e.g. shreetrading" /></Field>
            <Field label="Password" required>
              <div className="flex gap-1"><input className="input" value={f.password ?? ''} onChange={(e) => set('password', e.target.value)} /><button type="button" className="btn-secondary px-2" title="Generate" onClick={async () => set('password', await genPass())}><RefreshCw className="h-4 w-4" /></button></div>
            </Field>
            <Field label="Valid till" required><input className="input" type="date" value={f.validUntil ?? ''} onChange={(e) => set('validUntil', e.target.value)} /></Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[['1 month', 30], ['3 months', 91], ['6 months', 182], ['1 year', 365]].map(([l, d]) => (
              <button key={l} type="button" className="btn-secondary btn-sm" onClick={() => set('validUntil', addDays(todayIST(), d as number))}>{l}</button>
            ))}
          </div>
        </div>
        <Field label="Max users"><input className="input" type="number" min={1} value={f.maxUsers ?? 2} onChange={(e) => set('maxUsers', Number(e.target.value))} /></Field>
        <div className="flex items-end"><Switch checked={!!f.whatsappAllowed} onChange={(v) => set('whatsappAllowed', v)} label="Allow shared platform WhatsApp" /></div>
        <Field label="Internal notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function CredentialsModal({ open, onClose, tenantId, username, password, phone, name, validUntil }: { open: boolean; onClose: () => void; tenantId: string; username: string; password: string; phone: string; name: string; validUntil: string }) {
  const [to, setTo] = useState(phone);
  const [busy, setBusy] = useState(false);
  const url = window.location.origin;
  const text = fillTemplate('Namaste {name},\n\nYour GST billing account is ready.\n\nLogin: {url}\nUsername: *{username}*\nPassword: *{password}*\nValid till: {valid}\n\nPlease change the password after first login.', { name, url, username, password, valid: fmtDate(validUntil) });
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ ok: boolean; error?: string }>(`/api/admin/tenants/${tenantId}/send-credentials`, { to, username, password });
      r.ok ? toast.success('Login details sent on WhatsApp') : toast.error(r.error ?? 'Could not send');
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Login details" size="sm" footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-3 font-mono text-sm">
          <div>URL: {url}</div>
          <div>Username: <b>{username}</b></div>
          <div>Password: <b>{password}</b></div>
          <div>Valid till: {fmtDate(validUntil)}</div>
        </div>
        <p className="text-xs text-amber-700">Save or send the password now — it is not shown again (you can reset it later).</p>
        <button className="btn-secondary w-full" onClick={() => { navigator.clipboard?.writeText(text); toast.success('Copied'); }}><Copy className="h-4 w-4" /> Copy message</button>
        <Field label="Client WhatsApp"><input className="input" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-2">
          <button className="btn-wa flex-1" disabled={busy || !waNumber(to)} onClick={send}>{busy ? <Spinner /> : <Send className="h-4 w-4" />} Send (API)</button>
          <a className="btn-secondary flex-1" target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(to)}?text=${encodeURIComponent(text)}`}><MessageCircle className="h-4 w-4" /> Open WhatsApp</a>
        </div>
      </div>
    </Modal>
  );
}
