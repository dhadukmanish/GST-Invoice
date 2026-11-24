import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { money, renderInvoiceHtml, resolveTemplate, type PrintData } from '@gst/shared';
import { api, errText } from '@/lib/api';
import { downloadBlob, htmlToPdf, printHtml } from '@/lib/pdf';
import { InvoicePreview } from '@/components/InvoicePreview';
import { Loading, Spinner } from '@/components/ui';

/** What the customer sees when they open the WhatsApp link — no login. */
export default function PublicInvoice() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ['public', token], queryFn: () => api.get<{ data: PrintData; config: Record<string, unknown>; invoiceNo: string }>(`/api/public/invoices/${token}`), retry: false });
  const [busy, setBusy] = useState(false);
  const cfg = useMemo(() => resolveTemplate(q.data?.config), [q.data]);
  const html = useMemo(() => (q.data ? renderInvoiceHtml(q.data.data, cfg) : ''), [q.data, cfg]);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <div className="p-10 text-center text-slate-600">{errText(q.error) || 'Invoice not found'}</div>;
  const d = q.data.data;
  const thermal = cfg.preset === 'thermal';
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate font-bold">{d.company.name}</div>
            <div className="text-xs text-slate-500">
              Invoice {d.invoice.invoiceNo} · {money(d.invoice.total)}
              {(d.invoice.balance ?? 0) > 0 && <span className="font-semibold text-red-600"> · Due {money(d.invoice.balance)}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => printHtml(html)}><Printer className="h-4 w-4" /> Print</button>
            <button
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  downloadBlob(await htmlToPdf(html, { thermal }), `${d.invoice.invoiceNo.replace(/[^\w-]+/g, '_')}.pdf`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner /> : <Download className="h-4 w-4" />} PDF
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl p-2 sm:p-4">
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <InvoicePreview html={html} thermal={thermal} />
        </div>
      </div>
    </div>
  );
}
