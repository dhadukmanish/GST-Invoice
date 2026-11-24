import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Save, Send } from 'lucide-react';
import { api, errText, useSave } from '@/lib/api';
import { toast } from '@/lib/store';
import { Badge, Field, Loading, PageHeader, Spinner, Switch } from '@/components/ui';

export default function Platform() {
  const q = useQuery({ queryKey: ['platform'], queryFn: () => api.get<any>('/api/admin/platform') });
  const [b, setB] = useState<any>(null);
  const [w, setW] = useState<any>(null);
  const [token, setToken] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ['platform-wa-status'], queryFn: () => api.get<any>('/api/admin/platform/whatsapp/status') });
  const log = useQuery({ queryKey: ['platform-wa-log'], queryFn: () => api.get<{ rows: any[] }>('/api/admin/platform/whatsapp/messages') });
  const saveB = useSave({ invalidate: ['platform', 'branding'], success: 'Branding saved' });
  const saveW = useSave({ invalidate: ['platform', 'platform-wa-status'], success: 'WhatsApp saved', onSuccess: () => setToken('') });
  useEffect(() => {
    if (q.data) {
      setB(q.data.branding);
      setW(q.data.whatsapp);
    }
  }, [q.data]);
  if (!b || !w) return <Loading />;
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Platform settings" />
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Branding & defaults</h3><button className="btn-primary btn-sm" disabled={saveB.isPending} onClick={() => saveB.mutate({ method: 'put', url: '/api/admin/platform/branding', body: b })}><Save className="h-4 w-4" /> Save</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="App name"><input className="input" value={b.appName} onChange={(e) => setB({ ...b, appName: e.target.value })} /></Field>
          <Field label="Tagline (login page)"><input className="input" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} /></Field>
          <Field label="Support phone" hint="Shown to clients when expired / on login"><input className="input" value={b.supportPhone} onChange={(e) => setB({ ...b, supportPhone: e.target.value })} /></Field>
          <Field label="Support email"><input className="input" value={b.supportEmail} onChange={(e) => setB({ ...b, supportEmail: e.target.value })} /></Field>
          <Field label="Default validity for new clients (days)"><input className="input" type="number" value={b.defaultValidityDays} onChange={(e) => setB({ ...b, defaultValidityDays: Number(e.target.value) })} /></Field>
          <Field label="Default max users"><input className="input" type="number" value={b.defaultMaxUsers} onChange={(e) => setB({ ...b, defaultMaxUsers: Number(e.target.value) })} /></Field>
          <Field label="Login-details WhatsApp message" hint="{name} {app} {url} {username} {password} {valid_until} {support}" className="sm:col-span-2"><textarea className="input font-mono text-[13px]" rows={7} value={b.credentialsMessage} onChange={(e) => setB({ ...b, credentialsMessage: e.target.value })} /></Field>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Platform WhatsApp (your number)</h3><button className="btn-primary btn-sm" disabled={saveW.isPending} onClick={() => saveW.mutate({ method: 'put', url: '/api/admin/platform/whatsapp', body: { ...w, token: token || undefined } })}><Save className="h-4 w-4" /> Save</button></div>
        <p className="text-xs text-slate-500">Used to send login details and renewal reminders. Optionally share it with clients that have no own WhatsApp API (their invoices go from your number).</p>
        <Switch checked={w.enabled} onChange={(v) => setW({ ...w, enabled: v })} label="Enabled" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="API URL"><input className="input" value={w.apiUrl} onChange={(e) => setW({ ...w, apiUrl: e.target.value })} /></Field>
          <Field label="Device"><input className="input" value={w.device} onChange={(e) => setW({ ...w, device: e.target.value })} /></Field>
          <Field label="Token" hint={w.hasToken ? `Saved ${w.tokenHint} — blank keeps it` : undefined} className="sm:col-span-2"><input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></Field>
        </div>
        <Switch checked={w.shareWithClients} onChange={(v) => setW({ ...w, shareWithClients: v })} label="Share with clients" hint="Clients with 'Allow shared platform WhatsApp' can send invoices through this number" />
        {status.data?.configured && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <span>Device: <b>{status.data.device?.state ?? status.data.deviceError ?? '—'}</b></span>
            {status.data.balance && <span>Credits: <b>{String(status.data.balance.credits ?? '—')}</b></span>}
            {status.data.balanceError && <span className="text-red-600">{status.data.balanceError}</span>}
            <button className="btn-ghost btn-sm" onClick={() => status.refetch()}><RefreshCw className="h-3 w-3" /></button>
          </div>
        )}
        <div className="flex gap-2">
          <input className="input sm:w-56" placeholder="Mobile for test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button className="btn-secondary" disabled={busy || testTo.length < 10} onClick={async () => { setBusy(true); try { const r = await api.post<any>('/api/admin/platform/whatsapp/test', { to: testTo }); r.ok ? toast.success('Sent') : toast.error(r.error); log.refetch(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); } }}>{busy ? <Spinner /> : <Send className="h-4 w-4" />} Test</button>
        </div>
        {!!log.data?.rows.length && (
          <div className="divide-y divide-slate-100 rounded-lg border border-line text-xs">
            {log.data.rows.slice(0, 10).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5"><span className="truncate">{m.eventType} → {m.toNumber} {m.error && <span className="text-red-600">· {m.error}</span>}</span><Badge status={m.status} /></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
