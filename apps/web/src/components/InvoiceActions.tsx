import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Share2 } from 'lucide-react';
import { PAYMENT_MODES, money, renderInvoiceHtml, resolveTemplate, todayIST, waNumber, type PrintData } from '@gst/shared';
import { api, errText, useSave } from '@/lib/api';
import { htmlToPdf } from '@/lib/pdf';
import { toast } from '@/lib/store';
import { Badge, Field, Modal, Spinner, Switch, Tabs } from './ui';

type PrintPayload = { data: PrintData; config: Record<string, unknown>; publicUrl: string };

/** Builds the PDF of an invoice in the browser with the client's default template. */
export async function invoicePdf(invoiceId: string): Promise<{ blob: Blob; name: string }> {
  const p = await api.get<PrintPayload>(`/api/invoices/${invoiceId}/print`);
  const cfg = resolveTemplate(p.config);
  const html = renderInvoiceHtml(p.data, cfg);
  const blob = await htmlToPdf(html, { thermal: cfg.preset === 'thermal' || cfg.pageSize !== 'A4' && cfg.pageSize !== 'A5' });
  return { blob, name: `${p.data.invoice.invoiceNo.replace(/[^\w-]+/g, '_')}.pdf` };
}

export function WhatsAppDialog({ open, onClose, invoiceId, defaultKind = 'INVOICE' }: { open: boolean; onClose: () => void; invoiceId: string; defaultKind?: 'INVOICE' | 'REMINDER' }) {
  const info = useQuery({
    queryKey: ['wa-info', invoiceId],
    queryFn: () => api.get<{ to: string; invoiceMessage: string; reminderMessage: string; apiAvailable: boolean; attachPdf: boolean; history: any[] }>(`/api/invoices/${invoiceId}/whatsapp`),
    enabled: open,
  });
  const qc = useQueryClient();
  const [kind, setKind] = useState<'INVOICE' | 'REMINDER'>(defaultKind);
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState<'' | 'api' | 'share'>('');

  useEffect(() => {
    if (open) setKind(defaultKind);
  }, [open, defaultKind]);
  useEffect(() => {
    if (!info.data) return;
    setTo((t) => t || info.data.to);
    setMsg(kind === 'INVOICE' ? info.data.invoiceMessage : info.data.reminderMessage);
    setAttach(info.data.attachPdf);
  }, [info.data, kind]);

  const num = waNumber(to);
  const sendApi = async () => {
    if (!num) return toast.error('Enter a valid mobile number');
    setBusy('api');
    try {
      let mediaUrl: string | undefined;
      if (attach) {
        const pdf = await invoicePdf(invoiceId);
        mediaUrl = (await api.upload<{ url: string }>(`/api/invoices/${invoiceId}/pdf`, pdf.blob, 'application/pdf')).url;
      }
      await api.post(`/api/invoices/${invoiceId}/whatsapp`, { to: num, message: msg, mediaUrl, kind });
      toast.success('WhatsApp message queued — it will be sent in a few seconds');
      qc.invalidateQueries({ queryKey: ['wa-info', invoiceId] });
      onClose();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy('');
    }
  };

  /** Phone: share the PDF file straight into WhatsApp (free, from the user's own WhatsApp). */
  const canShareFiles = typeof navigator !== 'undefined' && 'canShare' in navigator;
  const sharePdf = async () => {
    setBusy('share');
    try {
      const pdf = await invoicePdf(invoiceId);
      const file = new File([pdf.blob], pdf.name, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: msg });
      } else {
        toast.info('This browser cannot share files — use "Open WhatsApp" (sends the link)');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(errText(e));
    } finally {
      setBusy('');
    }
  };

  const waLink = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-[#25D366]" /> Send on WhatsApp</span>} size="md">
      {info.isLoading ? (
        <div className="py-10 text-center"><Spinner className="inline h-5 w-5" /></div>
      ) : (
        <div className="space-y-3">
          <Tabs value={kind} onChange={setKind} tabs={[{ value: 'INVOICE', label: 'Invoice' }, { value: 'REMINDER', label: 'Payment reminder' }]} />
          <Field label="Customer WhatsApp number" hint={to && !num ? <span className="text-red-600">Number looks wrong</span> : undefined}>
            <input className="input" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="10-digit mobile" />
          </Field>
          <Field label="Message">
            <textarea className="input font-mono text-[13px]" rows={8} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </Field>
          {info.data?.apiAvailable ? (
            <Switch checked={attach} onChange={setAttach} label="Attach invoice PDF" hint="Sent automatically from your WhatsApp API number" />
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Automatic sending is not set up. "Open WhatsApp" opens your own WhatsApp with the message and invoice link ready — just press send.
            </p>
          )}
          {!!info.data?.history.length && (
            <div className="rounded-lg border border-line p-2 text-xs">
              <div className="mb-1 font-semibold text-slate-600">Sent earlier</div>
              {info.data.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-0.5">
                  <span>{new Date(h.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {h.eventType.toLowerCase()} · {h.toNumber}</span>
                  <Badge status={h.status} />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {info.data?.apiAvailable && (
              <button className="btn-wa flex-1" onClick={sendApi} disabled={!!busy || !num}>
                {busy === 'api' ? <Spinner /> : <Send className="h-4 w-4" />} Send now
              </button>
            )}
            <a className={info.data?.apiAvailable ? 'btn-secondary flex-1' : 'btn-wa flex-1'} href={num ? waLink : undefined} target="_blank" rel="noreferrer" onClick={(e) => !num && (e.preventDefault(), toast.error('Enter a valid mobile number'))}>
              <MessageCircle className="h-4 w-4" /> Open WhatsApp
            </a>
            {canShareFiles && (
              <button className="btn-secondary flex-1 sm:flex-none" onClick={sharePdf} disabled={!!busy}>
                {busy === 'share' ? <Spinner /> : <Share2 className="h-4 w-4" />} Share PDF
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PaymentDialog({ open, onClose, invoice }: { open: boolean; onClose: () => void; invoice: { id: string; invoiceNo: string; balance: number; customer: any } | null }) {
  const [f, setF] = useState({ paymentDate: todayIST(), amount: '', mode: 'UPI', reference: '', notes: '', sendWhatsapp: false });
  useEffect(() => {
    if (open && invoice) setF({ paymentDate: todayIST(), amount: String(invoice.balance), mode: 'UPI', reference: '', notes: '', sendWhatsapp: false });
  }, [open, invoice]);
  const save = useSave<{ whatsapp: string | null }>({
    invalidate: ['invoices', 'invoice', 'payments', 'dashboard', 'customers', 'ledger'],
    onSuccess: (r) => {
      toast.success('Payment recorded');
      if (r.whatsapp && r.whatsapp !== 'queued') toast.error(`WhatsApp: ${r.whatsapp}`);
      onClose();
    },
  });
  if (!invoice) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive payment · ${invoice.invoiceNo}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending || !(Number(f.amount) > 0)} onClick={() => save.mutate({ method: 'post', url: '/api/payments', body: { ...f, invoiceId: invoice.id } })}>
            {save.isPending && <Spinner />} Save payment
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          {invoice.customer?.name} · Balance due <b>{money(invoice.balance)}</b>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)" required>
            <input className="input text-lg font-semibold" type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_MODES.map((m) => (
            <button key={m} type="button" onClick={() => setF({ ...f, mode: m })} className={f.mode === m ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
              {m}
            </button>
          ))}
        </div>
        <Field label="Reference (UTR / cheque no.)">
          <input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
        <Field label="Note">
          <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        {invoice.customer?.phone && <Switch checked={f.sendWhatsapp} onChange={(v) => setF({ ...f, sendWhatsapp: v })} label="Send receipt on WhatsApp" hint={invoice.customer.phone} />}
      </div>
    </Modal>
  );
}
