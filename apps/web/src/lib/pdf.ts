/**
 * Renders invoice HTML in a hidden iframe and turns it into an A4 (or receipt-width) PDF in the
 * browser — same template as print, no server-side Chrome needed (keeps hosting cheap).
 */
export async function htmlToPdf(html: string, opts: { thermal?: boolean } = {}): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const iframe = document.createElement('iframe');
  const widthPx = opts.thermal ? 302 : 794; // 80mm / 210mm at 96dpi
  Object.assign(iframe.style, { position: 'fixed', left: '-10000px', top: '0', width: `${widthPx}px`, height: '1200px', border: '0' });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((r) => setTimeout(r, 250));
    await Promise.all([...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }))));
    const target = doc.body;
    iframe.style.height = `${target.scrollHeight + 20}px`;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: widthPx });
    if (opts.thermal) {
      const wMm = 80;
      const hMm = (canvas.height * wMm) / canvas.width;
      const pdf = new jsPDF({ unit: 'mm', format: [wMm, Math.max(60, hMm)] });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wMm, hMm);
      return pdf.output('blob');
    }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.9);
    let offset = 0;
    pdf.addImage(img, 'JPEG', 0, 0, pageW, imgH);
    while (imgH - offset > pageH + 1) {
      offset += pageH;
      pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, -offset, pageW, imgH);
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Print through a hidden iframe (works on desktop and most mobile browsers). */
export function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  }, 300);
}

export function toCsv(rows: Record<string, unknown>[], cols: { key: string; label: string }[]) {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(','))].join('\n');
}
export function downloadCsv(name: string, rows: Record<string, unknown>[], cols: { key: string; label: string }[]) {
  downloadBlob(new Blob(['﻿' + toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' }), name);
}

export const fileToDataUrl = (f: File, maxW = 500): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = String(r.result);
    };
    r.onerror = reject;
    r.readAsDataURL(f);
  });
