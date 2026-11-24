import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, Copy, Download, IndianRupee, Link2, MessageCircle, MoreVertical, Pencil, Printer, Trash2 } from 'lucide-react';
import { fmtDate, money, renderInvoiceHtml, resolveTemplate, type PrintData } from '@gst/shared';
import { api, errText, useSave } from '@/lib/api';
import { downloadBlob, htmlToPdf, printHtml } from '@/lib/pdf';
import { toast, useAuth } from '@/lib/store';
import { InvoicePreview } from '@/components/InvoicePreview';
import { PaymentDialog, WhatsAppDialog } from '@/components/InvoiceActions';
import { Badge, Confirm, Loading, Money, Spinner } from '@/components/ui';

export default function InvoiceView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const role = useAuth((s) => s.session?.user.role);
  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<any>(`/api/invoices/${id}`) });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<any[]>('/api/templates') });
  const [tplId, setTplId] = useState('');
  const print = useQuery({
    queryKey: ['invoice', id, 'print', tplId, inv.data?.updatedAt],
    queryFn: () => api.get<{ data: PrintData; config: Record<string, unknown>; publicUrl: string }>(`/api/invoices/${id}/print${tplId ? `?templateId=${tplId}` : ''}`),
    enabled: !!inv.data,
  });
  const cfg = useMemo(() => resolveTemplate(print.data?.config), [print.data]);
  const html = useMemo(() => (print.data ? renderInvoiceHtml(print.data.data, cfg) : ''), [print.data, cfg]);
  const [wa, setWa] = useState<'' | 'INVOICE' | 'REMINDER'>('');
  const [payOpen, setPayOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'' | 'cancel' | 'delete' | { payment: string }>('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const inval = ['invoices', 'invoice', 'dashboard', 'payments', 'customers', 'ledger'];
  const act = useSave({ invalidate: inval, onSuccess: () => setConfirm('') });

  if (inv.isLoading) return <Loading />;
  if (inv.error || !inv.data) return <div className="card p-8 text-center text-slate-600">{errText(inv.error)}</div>;
  const d = inv.data;
  const cancelled = d.status === 'cancelled';
  const thermal = cfg.preset === 'thermal';

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      downloadBlob(await htmlToPdf(html, { thermal }), `${d.invoiceNo.replace(/[^\w-]+/g, '_')}.pdf`);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {sp.get('created') && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div className="flex-1 text-sm text-green-900">Invoice <b>{d.invoiceNo}</b> saved for {money(d.total)}.</div>
          <button className="btn-wa btn-sm" onClick={() => setWa('INVOICE')}><MessageCircle className="h-4 w-4" /> Send on WhatsApp</button>
          <Link className="btn-secondary btn-sm" to="/invoices/new" onClick={() => setSp({})}>+ Another</Link>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{d.invoiceNo}</h1>
            <Badge status={d.status} />
          </div>
          <div className="text-sm text-slate-500">
            <Link to={`/customers/${d.customerId}`} className="font-medium text-slate-700 hover:underline">{d.customer.name}</Link> · {fmtDate(d.invoiceDate, true)}
            {d.dueDate && ` · due ${fmtDate(d.dueDate, true)}`}
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {!cancelled && d.balance > 0 && (
            <button className="btn-primary flex-1 sm:flex-none" onClick={() => setPayOpen(true)}><IndianRupee className="h-4 w-4" /> Receive</button>
          )}
          <button className="btn-wa flex-1 sm:flex-none" onClick={() => setWa(d.balance > 0 && !sp.get('created') ? 'REMINDER' : 'INVOICE')} disabled={cancelled}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          <button className="btn-secondary" onClick={() => printHtml(html)} disabled={!html}><Printer className="h-4 w-4" /> <span className="hidden sm:inline">Print</span></button>
          <button className="btn-secondary" onClick={downloadPdf} disabled={!html || pdfBusy}>{pdfBusy ? <Spinner /> : <Download className="h-4 w-4" />} <span className="hidden sm:inline">PDF</span></button>
          <div className="relative">
            <button className="btn-secondary px-2" onClick={() => setMenu(!menu)} aria-label="More"><MoreVertical className="h-4 w-4" /></button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-line bg-white py-1 text-sm shadow-lg">
                  {!cancelled && <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={() => nav(`/invoices/${id}/edit`)}><Pencil className="h-4 w-4" /> Edit</button>}
                  <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={() => { navigator.clipboard?.writeText(d.publicUrl); toast.success('Customer link copied'); setMenu(false); }}><Link2 className="h-4 w-4" /> Copy customer link</button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50" onClick={() => window.open(d.publicUrl, '_blank')}><Copy className="h-4 w-4" /> Open customer view</button>
                  {!cancelled && <button className="flex w-full items-center gap-2 px-3 py-2 text-amber-700 hover:bg-amber-50" onClick={() => { setConfirm('cancel'); setMenu(false); }}><Ban className="h-4 w-4" /> Cancel invoice</button>}
                  {role === 'admin' && <button className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50" onClick={() => { setConfirm('delete'); setMenu(false); }}><Trash2 className="h-4 w-4" /> Delete</button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-semibold text-slate-500">Preview</span>
            {(templates.data?.length ?? 0) > 1 && (
              <select className="input w-auto py-1 text-xs" value={tplId} onChange={(e) => setTplId(e.target.value)}>
                <option value="">Default template</option>
                {templates.data!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          {html ? <InvoicePreview html={html} thermal={thermal} className="bg-white" /> : <Loading />}
        </div>
        <div className="space-y-4">
          <div className="card p-4 text-sm">
            <div className="flex justify-between py-1"><span className="text-slate-500">Total</span><Money v={d.total} className="font-bold" /></div>
            <div className="flex justify-between py-1"><span className="text-slate-500">Received</span><Money v={d.paid} className="text-green-700" /></div>
            <div className="flex justify-between border-t border-line py-1 pt-2"><span className="font-semibold">Balance</span><Money v={d.balance} className={d.balance > 0 ? 'font-bold text-red-600' : 'font-bold'} /></div>
          </div>
          <div className="card">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">Payments</div>
            {d.payments.length ? (
              <div className="divide-y divide-slate-100">
                {d.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <div className="flex-1">
                      <div className="font-medium"><Money v={p.amount} /> · {p.mode}</div>
                      <div className="text-xs text-slate-500">{fmtDate(p.paymentDate, true)}{p.reference && ` · ${p.reference}`}</div>
                    </div>
                    <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setConfirm({ payment: p.id })} aria-label="Delete payment"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-500">No payment yet</div>
            )}
          </div>
        </div>
      </div>

      {wa && <WhatsAppDialog open={!!wa} onClose={() => setWa('')} invoiceId={d.id} defaultKind={wa} />}
      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} invoice={d} />
      <Confirm
        open={confirm === 'cancel'}
        onClose={() => setConfirm('')}
        title="Cancel invoice?"
        text="The invoice stays in the list as CANCELLED and is left out of sales and GST reports. The number is not reused."
        confirmText="Cancel invoice"
        danger
        busy={act.isPending}
        onConfirm={() => act.mutate({ method: 'post', url: `/api/invoices/${id}/cancel` })}
      />
      <Confirm
        open={confirm === 'delete'}
        onClose={() => setConfirm('')}
        title="Delete invoice permanently?"
        text="The invoice and its payments are removed for good. This cannot be undone. Prefer Cancel to keep the number sequence clean."
        confirmText="Delete"
        danger
        busy={act.isPending}
        onConfirm={() => act.mutate({ method: 'del', url: `/api/invoices/${id}` }, { onSuccess: () => nav('/invoices', { replace: true }) })}
      />
      <Confirm
        open={typeof confirm === 'object'}
        onClose={() => setConfirm('')}
        title="Delete this payment?"
        text="The invoice balance goes back up by this amount."
        confirmText="Delete payment"
        danger
        busy={act.isPending}
        onConfirm={() => typeof confirm === 'object' && act.mutate({ method: 'del', url: `/api/payments/${confirm.payment}` })}
      />
    </div>
  );
}
