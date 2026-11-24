import qrcode from 'qrcode-generator';
import { amountInWords, amt, fmtDate, money } from './format';
import { stateName } from './states';

/**
 * Invoice print renderer → one self-contained HTML document. Same code runs in the browser (preview,
 * print, PDF for WhatsApp) and in the API, so every client sees exactly what their template says.
 * Every visual choice comes from TemplateConfig (Settings → Invoice Templates).
 */

export type PresetKey = 'classic' | 'modern' | 'compact' | 'minimal' | 'thermal';

export interface TemplateConfig {
  preset: PresetKey;
  title: string;
  copyLabel: string;
  primaryColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  pageSize: 'A4' | 'A5' | '80mm' | '58mm';
  headerAlign: 'left' | 'center';
  signatureLabel: string;
  footerText: string;
  show: {
    logo: boolean;
    companyAddress: boolean;
    companyContact: boolean;
    hsn: boolean;
    unit: boolean;
    discount: boolean;
    lineTax: boolean;
    taxSummary: boolean;
    amountInWords: boolean;
    bankDetails: boolean;
    upiQr: boolean;
    terms: boolean;
    notes: boolean;
    signature: boolean;
    paidBalance: boolean;
    customerContact: boolean;
    dueDate: boolean;
  };
}

const SHOW_ALL: TemplateConfig['show'] = {
  logo: true,
  companyAddress: true,
  companyContact: true,
  hsn: true,
  unit: true,
  discount: true,
  lineTax: false,
  taxSummary: true,
  amountInWords: true,
  bankDetails: true,
  upiQr: true,
  terms: true,
  notes: true,
  signature: true,
  paidBalance: true,
  customerContact: true,
  dueDate: true,
};

const BASE: TemplateConfig = {
  preset: 'classic',
  title: 'TAX INVOICE',
  copyLabel: 'Original for Recipient',
  primaryColor: '#1d4ed8',
  textColor: '#111827',
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 11,
  pageSize: 'A4',
  headerAlign: 'left',
  signatureLabel: 'Authorised Signatory',
  footerText: 'This is a computer generated invoice.',
  show: SHOW_ALL,
};

export const PRESETS: Record<PresetKey, { name: string; description: string; config: TemplateConfig }> = {
  classic: { name: 'Classic', description: 'Bordered GST invoice (Tally style)', config: BASE },
  modern: {
    name: 'Modern',
    description: 'Colour header band, clean lines',
    config: { ...BASE, preset: 'modern', primaryColor: '#0f766e', show: { ...SHOW_ALL } },
  },
  compact: {
    name: 'Compact',
    description: 'Small font, fits many items',
    config: { ...BASE, preset: 'compact', fontSize: 9.5, primaryColor: '#374151', show: { ...SHOW_ALL, unit: false } },
  },
  minimal: {
    name: 'Minimal',
    description: 'No borders, simple and light',
    config: { ...BASE, preset: 'minimal', primaryColor: '#111827', headerAlign: 'left', show: { ...SHOW_ALL, taxSummary: false } },
  },
  thermal: {
    name: 'Thermal (80mm)',
    description: 'Shop receipt printer',
    config: {
      ...BASE,
      preset: 'thermal',
      pageSize: '80mm',
      fontSize: 10,
      primaryColor: '#000000',
      headerAlign: 'center',
      copyLabel: '',
      show: { ...SHOW_ALL, hsn: false, unit: false, discount: false, bankDetails: false, signature: false, companyContact: true },
    },
  },
};

export const COLOR_THEMES = ['#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#15803d', '#374151', '#000000'];
export const FONTS = ['Inter, Arial, sans-serif', 'Georgia, serif', '"Courier New", monospace', 'Verdana, sans-serif', 'Tahoma, sans-serif'];

/** Merge a stored (maybe partial / older) config over the preset defaults. */
export function resolveTemplate(stored?: Partial<TemplateConfig> | null): TemplateConfig {
  const base = PRESETS[(stored?.preset ?? 'classic') as PresetKey]?.config ?? BASE;
  return { ...base, ...(stored ?? {}), show: { ...base.show, ...(stored?.show ?? {}) } } as TemplateConfig;
}

export interface PrintCompany {
  name: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  logo?: string; // data URL
  signature?: string; // data URL
  bankName?: string;
  accountName?: string;
  accountNo?: string;
  ifsc?: string;
  branch?: string;
  upiId?: string;
  terms?: string;
}
export interface PrintCustomer {
  name: string;
  gstin?: string;
  address?: string;
  city?: string;
  stateCode?: string;
  pincode?: string;
  phone?: string;
  email?: string;
}
export interface PrintLine {
  name: string;
  description?: string;
  hsn?: string;
  unit?: string;
  qty: number;
  rate: number;
  discountPct?: number;
  gstRate: number;
  taxable: number;
  taxAmount: number;
  total: number;
}
export interface PrintInvoice {
  invoiceNo: string;
  invoiceDate: string;
  dueDate?: string | null;
  placeOfSupply?: string;
  isInterstate: boolean;
  priceIncludesTax?: boolean;
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  paid?: number;
  balance?: number;
  status?: string;
  notes?: string;
  extra?: { label: string; value: string }[];
  shipTo?: string;
}
export interface PrintData {
  company: PrintCompany;
  customer: PrintCustomer;
  invoice: PrintInvoice;
  lines: PrintLine[];
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (v: unknown) => esc(v).replace(/\n/g, '<br>');
const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3))));
const safeImg = (src?: string) => (src && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(src) ? src : '');
const safeColor = (c: string, fb: string) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : fb);

/** UPI payment QR (svg) for the balance amount. */
export function upiQrSvg(upiId: string, payee: string, amount: number, note: string, cell = 3): string {
  if (!upiId) return '';
  const url = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}${amount > 0 ? `&am=${amount.toFixed(2)}` : ''}&cu=INR&tn=${encodeURIComponent(note)}`;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}

function addressBlock(a: { address?: string; city?: string; stateCode?: string; pincode?: string }) {
  const addr = (a.address ?? '').toLowerCase();
  const l2 = [a.city, stateName(a.stateCode), a.pincode].filter((x) => x && !addr.includes(String(x).toLowerCase())).join(', ');
  return [a.address ? nl(a.address) : '', esc(l2)].filter(Boolean).join('<br>');
}

export function renderInvoiceHtml(data: PrintData, cfgIn?: Partial<TemplateConfig> | null): string {
  const cfg = resolveTemplate(cfgIn);
  return cfg.preset === 'thermal' || cfg.pageSize === '80mm' || cfg.pageSize === '58mm' ? renderThermal(data, cfg) : renderPage(data, cfg);
}

function renderPage(d: PrintData, cfg: TemplateConfig): string {
  const { company: c, customer: cu, invoice: inv, lines } = d;
  const S = cfg.show;
  const P = safeColor(cfg.primaryColor, '#1d4ed8');
  const T = safeColor(cfg.textColor, '#111827');
  const minimal = cfg.preset === 'minimal';
  const modern = cfg.preset === 'modern';
  const bd = minimal ? 'none' : `1px solid ${modern ? '#d1d5db' : '#4b5563'}`;
  const anyDisc = S.discount && lines.some((l) => (l.discountPct ?? 0) > 0);
  const logo = S.logo ? safeImg(c.logo) : '';
  const sign = safeImg(c.signature);
  const balance = inv.balance ?? inv.total - (inv.paid ?? 0);
  const qr = S.upiQr && c.upiId ? upiQrSvg(c.upiId, c.name, balance > 0 ? balance : inv.total, `Invoice ${inv.invoiceNo}`) : '';
  const pageW = cfg.pageSize === 'A5' ? '148mm' : '210mm';

  const cols: { h: string; align: string; w?: string; cell: (l: PrintLine, i: number) => string }[] = [
    { h: '#', align: 'center', w: '24px', cell: (_l, i) => String(i + 1) },
    { h: 'Item / Description', align: 'left', cell: (l) => `<b>${esc(l.name)}</b>${l.description ? `<div class="muted">${nl(l.description)}</div>` : ''}` },
  ];
  if (S.hsn) cols.push({ h: 'HSN/SAC', align: 'center', cell: (l) => esc(l.hsn) });
  cols.push({ h: 'Qty', align: 'right', cell: (l) => `${qtyFmt(l.qty)}${S.unit && l.unit ? ` <span class="muted">${esc(l.unit)}</span>` : ''}` });
  cols.push({ h: inv.priceIncludesTax ? 'Rate (incl.)' : 'Rate', align: 'right', cell: (l) => amt(l.rate) });
  if (anyDisc) cols.push({ h: 'Disc %', align: 'right', cell: (l) => (l.discountPct ? `${l.discountPct}` : '') });
  cols.push({ h: 'Taxable', align: 'right', cell: (l) => amt(l.taxable) });
  cols.push({ h: 'GST %', align: 'right', cell: (l) => `${l.gstRate}` });
  if (S.lineTax) cols.push({ h: 'Tax', align: 'right', cell: (l) => amt(l.taxAmount) });
  cols.push({ h: 'Amount', align: 'right', cell: (l) => amt(l.total) });

  const qtyTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const byRate = new Map<number, { taxable: number; tax: number }>();
  lines.forEach((l) => {
    const r = byRate.get(l.gstRate) ?? { taxable: 0, tax: 0 };
    r.taxable += l.taxable;
    r.tax += l.taxAmount;
    byRate.set(l.gstRate, r);
  });
  const rateRows = [...byRate.entries()].sort((a, b) => a[0] - b[0]);

  const totalsRows: [string, string, boolean?][] = [['Sub Total', amt(inv.subtotal)]];
  if (inv.discount > 0) totalsRows.push(['Discount', `- ${amt(inv.discount)}`]);
  totalsRows.push(['Taxable Amount', amt(inv.taxable)]);
  if (inv.isInterstate) totalsRows.push(['IGST', amt(inv.igst)]);
  else {
    totalsRows.push(['CGST', amt(inv.cgst)]);
    totalsRows.push(['SGST', amt(inv.sgst)]);
  }
  if (Math.abs(inv.roundOff) > 0.004) totalsRows.push(['Round Off', amt(inv.roundOff)]);

  const head = `
  <div class="head ${cfg.headerAlign === 'center' ? 'center' : ''}">
    ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
    <div class="firm">
      <div class="fname">${esc(c.name)}</div>
      ${c.legalName && c.legalName !== c.name ? `<div class="muted">${esc(c.legalName)}</div>` : ''}
      ${S.companyAddress ? `<div>${addressBlock(c)}</div>` : ''}
      ${S.companyContact ? `<div>${[c.phone ? `Ph: ${esc(c.phone)}` : '', c.email ? esc(c.email) : ''].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>` : ''}
      ${c.gstin ? `<div><b>GSTIN: ${esc(c.gstin)}</b>${c.pan ? ` &nbsp; PAN: ${esc(c.pan)}` : ''}</div>` : ''}
    </div>
  </div>`;

  const meta: [string, string][] = [
    ['Invoice No', inv.invoiceNo],
    ['Invoice Date', fmtDate(inv.invoiceDate)],
  ];
  if (S.dueDate && inv.dueDate) meta.push(['Due Date', fmtDate(inv.dueDate)]);
  meta.push(['Place of Supply', inv.placeOfSupply ? `${stateName(inv.placeOfSupply)} (${inv.placeOfSupply})` : '']);
  for (const e of inv.extra ?? []) if (e.value) meta.push([e.label, e.value]);

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(inv.invoiceNo)} - ${esc(c.name)}</title>
<style>
@page{size:${cfg.pageSize === 'A5' ? 'A5' : 'A4'};margin:8mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:${cfg.fontFamily};font-size:${cfg.fontSize}px;line-height:1.4;color:${T};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:${pageW};max-width:100%;margin:0 auto;padding:${minimal ? '8mm' : '6mm'};}
.box{border:${bd};${modern ? 'border-radius:6px;overflow:hidden;' : ''}}
.title{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;${modern ? `background:${P};color:#fff;` : `border-bottom:${bd};`}}
.title h1{margin:0;font-size:${cfg.fontSize + 5}px;letter-spacing:.08em;${modern ? '' : `color:${P};`}}
.copy{font-size:${cfg.fontSize - 1.5}px;text-transform:uppercase;letter-spacing:.06em;opacity:.85}
.head{display:flex;gap:12px;align-items:flex-start;padding:10px;border-bottom:${bd}}
.head.center{flex-direction:column;align-items:center;text-align:center}
.logo{max-height:64px;max-width:140px;object-fit:contain}
.fname{font-size:${cfg.fontSize + 7}px;font-weight:800;color:${P};line-height:1.2;margin-bottom:2px}
.muted{color:#6b7280;font-size:${cfg.fontSize - 1}px}
.grid{display:grid;grid-template-columns:1fr 1fr;border-bottom:${bd}}
.grid>div{padding:8px 10px}
.grid>div+div{border-left:${bd}}
.lbl{font-size:${cfg.fontSize - 1.5}px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;font-weight:700;margin-bottom:3px}
.meta td{padding:1.5px 0;vertical-align:top}
.meta td:first-child{color:#4b5563;padding-right:10px;white-space:nowrap}
table.items{width:100%;border-collapse:collapse}
table td,table th{line-height:1.35}
table.items th{background:${minimal ? 'transparent' : modern ? `${P}14` : `${P}`};color:${minimal || modern ? P : '#fff'};font-weight:700;font-size:${cfg.fontSize - 1}px;padding:5px 6px;border-bottom:${minimal ? `2px solid ${P}` : bd};text-transform:uppercase;letter-spacing:.03em}
table.items td{padding:5px 6px;vertical-align:top;border-bottom:${minimal ? '1px solid #e5e7eb' : modern ? '1px solid #eef0f3' : 'none'}}
${minimal || modern ? '' : 'table.items td+td,table.items th+th{border-left:' + bd + '}'}
table.items tfoot td{font-weight:700;border-top:${bd};border-bottom:${bd}}
.r{text-align:right}.c{text-align:center}
.bottom{display:grid;grid-template-columns:1.3fr 1fr}
.bottom>div{padding:8px 10px}
.bottom>div+div{border-left:${bd}}
table.tot{width:100%;border-collapse:collapse}
table.tot td{padding:2.5px 0}
table.tot tr.grand td{font-size:${cfg.fontSize + 3}px;font-weight:800;color:${P};border-top:1px solid #9ca3af;padding-top:5px}
table.tax{width:100%;border-collapse:collapse;margin-top:6px;font-size:${cfg.fontSize - 1.5}px}
table.tax th,table.tax td{border:1px solid #d1d5db;padding:2px 4px}
table.tax th{background:#f3f4f6}
.qr{display:flex;gap:10px;align-items:center;margin-top:8px}
.qr svg{width:86px;height:86px}
.sign{display:flex;justify-content:space-between;align-items:flex-end;padding:8px 10px;border-top:${bd};min-height:70px}
.sign img{max-height:48px;max-width:150px;display:block;margin-left:auto}
.foot{text-align:center;color:#6b7280;font-size:${cfg.fontSize - 2}px;padding:6px}
.stamp{display:inline-block;line-height:1.5;padding:0 8px;border-radius:10px;font-size:${cfg.fontSize - 2}px;font-weight:700;text-transform:uppercase}
.st-paid{background:#dcfce7;color:#166534}.st-partial{background:#fef3c7;color:#92400e}.st-unpaid{background:#fee2e2;color:#991b1b}.st-cancelled{background:#e5e7eb;color:#374151}
@media print{.sheet{padding:0;width:auto}}
</style></head><body><div class="sheet"><div class="box">
<div class="title"><h1>${esc(cfg.title || 'TAX INVOICE')}</h1><span class="copy">${esc(cfg.copyLabel)}</span></div>
${head}
<div class="grid">
  <div>
    <div class="lbl">Bill To</div>
    <div style="font-weight:700;font-size:${cfg.fontSize + 1.5}px">${esc(cu.name)}</div>
    <div>${addressBlock(cu)}</div>
    ${cu.gstin ? `<div><b>GSTIN: ${esc(cu.gstin)}</b></div>` : '<div class="muted">Unregistered</div>'}
    ${S.customerContact && (cu.phone || cu.email) ? `<div>${[cu.phone ? `Ph: ${esc(cu.phone)}` : '', esc(cu.email ?? '')].filter(Boolean).join(' | ')}</div>` : ''}
    ${inv.shipTo ? `<div class="lbl" style="margin-top:6px">Ship To</div><div>${nl(inv.shipTo)}</div>` : ''}
  </div>
  <div><table class="meta">${meta.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}
  ${S.paidBalance && inv.status ? `<tr><td>Status</td><td><span class="stamp st-${esc(inv.status)}">${esc(inv.status)}</span></td></tr>` : ''}</table></div>
</div>
<table class="items">
<thead><tr>${cols.map((col) => `<th class="${col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : ''}"${col.w ? ` style="width:${col.w}"` : ''}>${col.h}</th>`).join('')}</tr></thead>
<tbody>${lines
    .map((l, i) => `<tr>${cols.map((col) => `<td class="${col.align === 'right' ? 'r' : col.align === 'center' ? 'c' : ''}">${col.cell(l, i)}</td>`).join('')}</tr>`)
    .join('')}
${!minimal && !modern ? `<tr style="height:${Math.max(0, 6 - lines.length) * 18}px">${cols.map(() => '<td></td>').join('')}</tr>` : ''}
</tbody>
<tfoot><tr>${cols
    .map((col) =>
      col.h === 'Item / Description'
        ? '<td>Total</td>'
        : col.h === 'Qty'
          ? `<td class="r">${qtyFmt(qtyTotal)}</td>`
          : col.h === 'Taxable'
            ? `<td class="r">${amt(inv.taxable)}</td>`
            : col.h === 'Tax'
              ? `<td class="r">${amt(inv.cgst + inv.sgst + inv.igst)}</td>`
              : col.h === 'Amount'
                ? `<td class="r">${amt(inv.taxable + inv.cgst + inv.sgst + inv.igst)}</td>`
                : '<td></td>',
    )
    .join('')}</tr></tfoot>
</table>
<div class="bottom">
  <div>
    ${S.amountInWords ? `<div class="lbl">Amount in words</div><div style="font-weight:600">${esc(amountInWords(inv.total))}</div>` : ''}
    ${
      S.taxSummary
        ? `<table class="tax"><thead><tr><th>GST %</th><th class="r">Taxable</th>${inv.isInterstate ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}<th class="r">Total Tax</th></tr></thead><tbody>${rateRows
            .map(
              ([rate, v]) =>
                `<tr><td>${rate}%</td><td class="r">${amt(v.taxable)}</td>${inv.isInterstate ? `<td class="r">${amt(v.tax)}</td>` : `<td class="r">${amt(v.tax / 2)}</td><td class="r">${amt(v.tax - Math.round((v.tax / 2) * 100) / 100)}</td>`}<td class="r">${amt(v.tax)}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : ''
    }
    ${
      S.bankDetails && (c.bankName || c.accountNo)
        ? `<div class="lbl" style="margin-top:8px">Bank Details</div><div>${[c.accountName ? `A/c Name: ${esc(c.accountName)}` : '', c.bankName ? `Bank: ${esc(c.bankName)}` : '', c.accountNo ? `A/c No: <b>${esc(c.accountNo)}</b>` : '', c.ifsc ? `IFSC: ${esc(c.ifsc)}` : '', c.branch ? `Branch: ${esc(c.branch)}` : ''].filter(Boolean).join('<br>')}</div>`
        : ''
    }
    ${qr ? `<div class="qr">${qr}<div><b>Scan &amp; Pay (UPI)</b><div class="muted">${esc(c.upiId)}</div></div></div>` : ''}
  </div>
  <div>
    <table class="tot">${totalsRows.map(([k, v]) => `<tr><td>${k}</td><td class="r">${v}</td></tr>`).join('')}
      <tr class="grand"><td>Grand Total</td><td class="r">${money(inv.total)}</td></tr>
      ${S.paidBalance && (inv.paid ?? 0) > 0 ? `<tr><td>Received</td><td class="r">${amt(inv.paid)}</td></tr><tr><td><b>Balance Due</b></td><td class="r"><b>${money(balance)}</b></td></tr>` : ''}
    </table>
  </div>
</div>
${S.notes && inv.notes ? `<div style="padding:6px 10px;border-top:${bd}"><span class="lbl">Notes: </span>${nl(inv.notes)}</div>` : ''}
${S.terms && c.terms ? `<div style="padding:6px 10px;border-top:${bd}"><div class="lbl">Terms &amp; Conditions</div><div class="muted" style="color:${T}">${nl(c.terms)}</div></div>` : ''}
${S.signature ? `<div class="sign"><div class="muted">Receiver's Signature</div><div style="text-align:right">${sign ? `<img src="${sign}" alt="">` : '<div style="height:36px"></div>'}<div>For <b>${esc(c.name)}</b></div><div class="muted">${esc(cfg.signatureLabel)}</div></div></div>` : ''}
</div>
${cfg.footerText ? `<div class="foot">${esc(cfg.footerText)}</div>` : ''}
</div></body></html>`;
  return html;
}

function renderThermal(d: PrintData, cfg: TemplateConfig): string {
  const { company: c, customer: cu, invoice: inv, lines } = d;
  const S = cfg.show;
  const w = cfg.pageSize === '58mm' ? '58mm' : '80mm';
  const balance = inv.balance ?? inv.total - (inv.paid ?? 0);
  const qr = S.upiQr && c.upiId ? upiQrSvg(c.upiId, c.name, balance > 0 ? balance : inv.total, `Invoice ${inv.invoiceNo}`, 2) : '';
  const logo = S.logo ? safeImg(c.logo) : '';
  const row = (k: string, v: string, b = false) => `<tr${b ? ' style="font-weight:800;font-size:1.15em"' : ''}><td>${k}</td><td class="r">${v}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(inv.invoiceNo)}</title>
<style>@page{size:${w} auto;margin:2mm}*{box-sizing:border-box}body{margin:0;background:#fff;font-family:${cfg.fontFamily};font-size:${cfg.fontSize}px;line-height:1.35;color:#000}
.s{width:${w};max-width:100%;margin:0 auto;padding:3mm}.c{text-align:center}.r{text-align:right}hr{border:0;border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}td,th{padding:1px 0;vertical-align:top}th{text-align:left;border-bottom:1px dashed #000}.m{font-size:.9em}
img.l{max-height:48px;max-width:60%}.qr svg{width:110px;height:110px}</style></head><body><div class="s">
<div class="c">${logo ? `<img class="l" src="${logo}"><br>` : ''}<b style="font-size:1.3em">${esc(c.name)}</b><br>
${S.companyAddress ? `${addressBlock(c)}<br>` : ''}${S.companyContact && c.phone ? `Ph: ${esc(c.phone)}<br>` : ''}${c.gstin ? `GSTIN: ${esc(c.gstin)}` : ''}</div>
<hr><div class="c"><b>${esc(cfg.title || 'TAX INVOICE')}</b></div>
<table class="m"><tr><td>No: <b>${esc(inv.invoiceNo)}</b></td><td class="r">${fmtDate(inv.invoiceDate)}</td></tr></table>
<div class="m">To: <b>${esc(cu.name)}</b>${cu.gstin ? `<br>GSTIN: ${esc(cu.gstin)}` : ''}${S.customerContact && cu.phone ? `<br>Ph: ${esc(cu.phone)}` : ''}</div>
<hr><table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr></thead><tbody>
${lines.map((l) => `<tr><td colspan="4">${esc(l.name)} <span class="m">(${l.gstRate}%)</span></td></tr><tr><td></td><td class="r">${qtyFmt(l.qty)}</td><td class="r">${amt(l.rate)}</td><td class="r">${amt(l.total)}</td></tr>`).join('')}
</tbody></table><hr><table>
${row('Taxable', amt(inv.taxable))}${inv.discount > 0 ? row('Discount', `-${amt(inv.discount)}`) : ''}${inv.isInterstate ? row('IGST', amt(inv.igst)) : row('CGST', amt(inv.cgst)) + row('SGST', amt(inv.sgst))}
${Math.abs(inv.roundOff) > 0.004 ? row('Round Off', amt(inv.roundOff)) : ''}${row('TOTAL', money(inv.total), true)}
${S.paidBalance && (inv.paid ?? 0) > 0 ? row('Received', amt(inv.paid)) + row('Balance', money(balance)) : ''}</table>
${S.amountInWords ? `<div class="m">${esc(amountInWords(inv.total))}</div>` : ''}
${qr ? `<hr><div class="c qr">${qr}<div class="m">Scan to pay · ${esc(c.upiId)}</div></div>` : ''}
${S.terms && c.terms ? `<hr><div class="m">${nl(c.terms)}</div>` : ''}
<hr><div class="c m">${esc(cfg.footerText || 'Thank you! Visit again.')}</div></div></body></html>`;
}

/** Sample data for template previews. */
export const SAMPLE_PRINT: PrintData = {
  company: {
    name: 'Shree Trading Co.',
    legalName: 'Shree Trading Company',
    gstin: '24AABCS1234A1Z5',
    address: '101, Sunrise Business Park, Ring Road',
    city: 'Surat',
    stateCode: '24',
    pincode: '395002',
    phone: '98250 12345',
    email: 'accounts@shreetrading.in',
    bankName: 'HDFC Bank',
    accountName: 'Shree Trading Co.',
    accountNo: '50200012345678',
    ifsc: 'HDFC0001234',
    branch: 'Ring Road, Surat',
    upiId: 'shreetrading@hdfcbank',
    terms: '1. Goods once sold will not be taken back.\n2. Interest @18% p.a. on payments after due date.\n3. Subject to Surat jurisdiction.',
  },
  customer: { name: 'ABC Retail Pvt Ltd', gstin: '24AAACA1111A1Z1', address: '12, Station Road', city: 'Ahmedabad', stateCode: '24', pincode: '380001', phone: '9876543210' },
  invoice: {
    invoiceNo: 'INV/2026-27/0042',
    invoiceDate: '2026-11-24',
    dueDate: '2026-12-09',
    placeOfSupply: '24',
    isInterstate: false,
    subtotal: 13900,
    discount: 0,
    taxable: 13900,
    cgst: 1146,
    sgst: 1146,
    igst: 0,
    roundOff: 0,
    total: 16192,
    paid: 5000,
    balance: 11192,
    status: 'partial',
    notes: 'Delivered by hand.',
    extra: [{ label: 'PO No', value: 'PO-7781' }],
  },
  lines: [
    { name: 'Office Chair (Ergo)', hsn: '9401', unit: 'PCS', qty: 2, rate: 4500, gstRate: 18, taxable: 9000, taxAmount: 1620, total: 10620 },
    { name: 'Printer Paper A4', description: '75 GSM, 500 sheets', hsn: '4802', unit: 'PACK', qty: 10, rate: 350, gstRate: 12, taxable: 3500, taxAmount: 420, total: 3920 },
    { name: 'USB Cable 1.5m', hsn: '8544', unit: 'PCS', qty: 7, rate: 200, gstRate: 18, taxable: 1400, taxAmount: 252, total: 1652 },
  ],
};
