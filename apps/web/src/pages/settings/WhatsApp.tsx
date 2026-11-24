import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, RotateCcw, Save, Send } from 'lucide-react';
import { WA_PLACEHOLDERS } from '@gst/shared';
import { api, errText, useSave } from '@/lib/api';
import { toast } from '@/lib/store';
import { Badge, Field, Loading, PageHeader, Spinner, Switch, Tabs } from '@/components/ui';

export default function WhatsAppSettings() {
  const cfg = useQuery({ queryKey: ['wa-config'], queryFn: () => api.get<any>('/api/settings/whatsapp') });
  const [f, setF] = useState<any>(null);
  const [token, setToken] = useState('');
  const [tpl, setTpl] = useState<'invoice' | 'payment' | 'reminder'>('invoice');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [page, setPage] = useState(1);
  const status = useQuery({ queryKey: ['wa-status'], queryFn: () => api.get<any>('/api/settings/whatsapp/status'), enabled: !!cfg.data });
  const log = useQuery({ queryKey: ['wa-log', page], queryFn: () => api.get<{ rows: any[]; total: number }>(`/api/settings/whatsapp/messages?page=${page}`), refetchInterval: 20_000 });
  const save = useSave({ invalidate: ['wa-config', 'wa-status'], success: 'WhatsApp settings saved', onSuccess: () => setToken('') });
  const retry = useSave({ invalidate: ['wa-log'], success: 'Queued again' });
  useEffect(() => {
    if (cfg.data) setF(cfg.data);
  }, [cfg.data]);
  if (!f) return <Loading />;
  const set = (k: string, v: unknown) => setF((p: any) => ({ ...p, [k]: v }));

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post<{ ok: boolean; error?: string }>('/api/settings/whatsapp/test', { to: testTo });
      r.ok ? toast.success(f.enabled ? 'Test message sent' : 'Test sent — now turn ON "Use my own WhatsApp API account" and Save') : toast.error(r.error ?? 'Could not send');
      log.refetch();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="WhatsApp" subtitle="Send invoices, receipts and reminders on WhatsApp" actions={<button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ method: 'put', url: '/api/settings/whatsapp', body: { ...f, token: token || undefined } })}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>} />
      <div className="space-y-4">
        <div className="card p-4 text-sm">
          {f.activeSender ? (
            <div className="flex items-center gap-2 text-green-800"><CheckCircle2 className="h-5 w-5" /> Automatic sending is active ({f.activeSender === 'own' ? 'your own WhatsApp API number' : 'shared platform number'}).</div>
          ) : (
            <div className="text-slate-600">Automatic sending is <b>off</b>. You can still send every invoice for free with <b>Open WhatsApp</b> (opens your WhatsApp with the message and invoice link) or <b>Share PDF</b> on phone. Add an API token below to send automatically with the PDF attached.</div>
          )}
        </div>

        <div className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold">WhatsApp API (optional)</h3>
          <Switch checked={f.enabled} onChange={(v) => set('enabled', v)} label="Use my own WhatsApp API account" />
          {!f.enabled && (f.hasToken || token) && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Token is saved but this switch is <b>OFF</b> — invoices will not be sent automatically. Turn it on and press Save.</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="API URL"><input className="input" value={f.apiUrl} onChange={(e) => set('apiUrl', e.target.value)} /></Field>
            <Field label="Device / instance (if any)"><input className="input" autoComplete="off" name="wa-device" value={f.device} onChange={(e) => set('device', e.target.value)} placeholder="Leave blank unless your provider gave one" /></Field>
            <Field label="API token" hint={f.hasToken ? `Saved: ${f.tokenHint} — leave blank to keep` : 'Given by your WhatsApp API provider'} className="sm:col-span-2">
              <input className="input" type="password" value={token} onChange={(e) => { setToken(e.target.value); if (e.target.value && !f.hasToken) set('enabled', true); }} placeholder={f.hasToken ? '••••••••' : ''} name="wa-token" autoComplete="new-password" />
            </Field>
          </div>
          {status.data?.configured && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span>Number: <b>{status.data.device?.state ?? status.data.deviceError ?? '—'}</b></span>
              {status.data.balance && <span>Credits: <b>{String(status.data.balance.credits ?? '—')}</b> · valid till {String(status.data.balance.validTill ?? '—')}</span>}
              {status.data.balanceError && <span className="text-red-600">{status.data.balanceError}</span>}
              <button className="btn-ghost btn-sm" onClick={() => status.refetch()}><RefreshCw className="h-3 w-3" /> Check</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <input className="input sm:w-56" inputMode="tel" placeholder="Your mobile for test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button className="btn-secondary" disabled={testing || testTo.length < 10} onClick={test}>{testing ? <Spinner /> : <Send className="h-4 w-4" />} Send test</button>
          </div>
        </div>

        <div className="card space-y-2 p-4">
          <h3 className="text-sm font-semibold">Automatic messages</h3>
          <Switch checked={f.autoOnInvoice} onChange={(v) => set('autoOnInvoice', v)} label="Send invoice link when an invoice is saved" hint="Only when the customer has a mobile number and sending is active" />
          <Switch checked={f.autoOnPayment} onChange={(v) => set('autoOnPayment', v)} label="Send receipt when a payment is recorded" />
          <Switch checked={f.attachPdf} onChange={(v) => set('attachPdf', v)} label="Attach PDF when sending from the invoice screen" />
        </div>

        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Message templates</h3>
          <Tabs value={tpl} onChange={setTpl} tabs={[{ value: 'invoice', label: 'Invoice' }, { value: 'payment', label: 'Payment receipt' }, { value: 'reminder', label: 'Reminder' }]} />
          <textarea className="input font-mono text-[13px]" rows={9} value={f.templates[tpl]} onChange={(e) => set('templates', { ...f.templates, [tpl]: e.target.value })} />
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {WA_PLACEHOLDERS.map((p) => (
              <button key={p} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-brand-100" onClick={() => set('templates', { ...f.templates, [tpl]: `${f.templates[tpl]}{${p}}` })}>{`{${p}}`}</button>
            ))}
            <button className="btn-ghost btn-sm ml-auto" onClick={() => set('templates', { ...f.templates, [tpl]: f.defaults[tpl] })}><RotateCcw className="h-3 w-3" /> Default</button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Use *text* for bold. {'{link}'} opens the invoice online (view / download PDF).</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h3 className="text-sm font-semibold">Sent messages</h3>
            <button className="btn-ghost btn-sm" onClick={() => log.refetch()}><RefreshCw className="h-3 w-3" /></button>
          </div>
          {log.data?.rows.length ? (
            <div className="divide-y divide-slate-100">
              {log.data.rows.map((m) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="font-medium">{m.toNumber}</span><span className="text-xs capitalize text-slate-500">{m.eventType.toLowerCase()}</span></div>
                    <div className="truncate text-xs text-slate-500">{m.message.replace(/\n/g, ' ')}</div>
                    {m.error && <div className="text-xs text-red-600">{m.error}</div>}
                  </div>
                  <div className="text-right">
                    <Badge status={m.status} />
                    <div className="text-[11px] text-slate-400">{new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    {m.status === 'FAILED' && <button className="text-[11px] font-semibold text-brand-700" onClick={() => retry.mutate({ method: 'post', url: `/api/settings/whatsapp/messages/${m.id}/retry` })}>Retry</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-slate-500">No messages yet</div>
          )}
          {(log.data?.total ?? 0) > 25 && (
            <div className="flex justify-center gap-2 border-t border-line p-2 text-sm">
              <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
              <button className="btn-secondary btn-sm" disabled={page * 25 >= (log.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
