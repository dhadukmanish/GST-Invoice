/**
 * GST invoice arithmetic. Used by the web form (live totals) and by the API (authoritative totals),
 * so the number the user sees is the number that gets saved.
 */

export interface CalcLineInput {
  qty: number;
  rate: number;
  discountPct?: number;
  gstRate: number;
}

export interface CalcOptions {
  /** Extra discount (₹) on the whole invoice, spread over the lines before tax. */
  discount?: number;
  /** Rates already include GST (common for retail). */
  priceIncludesTax?: boolean;
  /** Seller state != place of supply → IGST, else CGST + SGST. */
  interstate: boolean;
  /** Round the grand total to the nearest rupee. */
  roundOff?: boolean;
}

export interface CalcLine {
  gross: number; // qty × rate
  lineDiscount: number;
  invoiceDiscount: number; // share of the invoice discount
  taxable: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number; // taxable + tax
}

export interface CalcResult {
  lines: CalcLine[];
  subtotal: number; // after line discounts
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  total: number;
  /** Per GST rate, for the tax summary on the invoice. */
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON * 100) / 100;
const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function calcInvoice(input: CalcLineInput[], opt: CalcOptions): CalcResult {
  const nets = input.map((l) => {
    const gross = r2(n0(l.qty) * n0(l.rate));
    const lineDiscount = r2((gross * Math.min(100, Math.max(0, n0(l.discountPct)))) / 100);
    return { gross, lineDiscount, net: r2(gross - lineDiscount) };
  });
  const subtotal = r2(nets.reduce((s, x) => s + x.net, 0));
  const discount = Math.min(subtotal, Math.max(0, r2(n0(opt.discount))));

  // Spread the invoice discount by value; the last line takes the rounding remainder.
  let spread = 0;
  const lines: CalcLine[] = input.map((l, i) => {
    const { gross, lineDiscount, net } = nets[i];
    let share = 0;
    if (discount > 0 && subtotal > 0) {
      share = i === input.length - 1 ? r2(discount - spread) : r2((discount * net) / subtotal);
      spread = r2(spread + share);
    }
    const after = r2(net - share);
    const g = Math.max(0, n0(l.gstRate));
    let taxable: number, taxAmount: number;
    if (opt.priceIncludesTax) {
      taxable = r2(after / (1 + g / 100));
      taxAmount = r2(after - taxable);
    } else {
      taxable = after;
      taxAmount = r2((taxable * g) / 100);
    }
    const cgst = opt.interstate ? 0 : r2(taxAmount / 2);
    const sgst = opt.interstate ? 0 : r2(taxAmount - cgst);
    const igst = opt.interstate ? taxAmount : 0;
    return { gross, lineDiscount, invoiceDiscount: share, taxable, taxAmount, cgst, sgst, igst, total: r2(taxable + taxAmount) };
  });

  const sum = (k: keyof CalcLine) => r2(lines.reduce((s, l) => s + l[k], 0));
  const taxable = sum('taxable');
  const cgst = sum('cgst');
  const sgst = sum('sgst');
  const igst = sum('igst');
  const taxTotal = r2(cgst + sgst + igst);
  const raw = r2(taxable + taxTotal);
  const total = opt.roundOff ? Math.round(raw) : raw;
  const roundOff = r2(total - raw);

  const rateMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  input.forEach((l, i) => {
    const rate = Math.max(0, n0(l.gstRate));
    const row = rateMap.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    row.taxable = r2(row.taxable + lines[i].taxable);
    row.cgst = r2(row.cgst + lines[i].cgst);
    row.sgst = r2(row.sgst + lines[i].sgst);
    row.igst = r2(row.igst + lines[i].igst);
    rateMap.set(rate, row);
  });

  return {
    lines,
    subtotal,
    discount,
    taxable,
    cgst,
    sgst,
    igst,
    taxTotal,
    roundOff,
    total,
    byRate: [...rateMap.values()].sort((a, b) => a.rate - b.rate),
  };
}

/** Payment status from total and amount received. */
export function paymentStatus(total: number, paid: number): 'unpaid' | 'partial' | 'paid' {
  if (paid <= 0.004) return 'unpaid';
  if (paid + 0.004 >= total) return 'paid';
  return 'partial';
}

/** Indian financial year label for a date, e.g. 2026-11-24 → "2026-27". */
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Build an invoice number from the series settings. {FY}, {YYYY}, {YY}, {MM} are replaced. */
export function formatInvoiceNo(prefix: string, seq: number, padding: number, isoDate: string): string {
  const fy = financialYear(isoDate);
  const [y, m] = isoDate.split('-');
  const p = (prefix ?? '').replace(/\{FY\}/g, fy).replace(/\{YYYY\}/g, y).replace(/\{YY\}/g, y.slice(2)).replace(/\{MM\}/g, m);
  return `${p}${String(seq).padStart(Math.max(1, Math.min(8, padding || 1)), '0')}`;
}
