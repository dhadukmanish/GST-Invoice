export const amt = (v: unknown) =>
  (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v: unknown) => `${(Number(v) || 0) < 0 ? '-' : ''}₹${amt(Math.abs(Number(v) || 0))}`;

/** yyyy-mm-dd → dd-mm-yyyy (or "24 Nov 2026" when long). */
export function fmtDate(iso?: string | null, long = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  if (!long) return `${m[3]}-${m[2]}-${m[1]}`;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return `${Number(m[3])} ${mon} ${m[1]}`;
}

/** Today in India (yyyy-mm-dd), independent of the server/browser time zone. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below1000 = (n: number): string => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(' ');
};
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}
export function amountInWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - whole) * 100);
  return `Rupees ${numberToWords(whole)}${paise ? ` and ${numberToWords(paise)} Paise` : ''} Only`;
}

/** 10-digit Indian numbers get 91 in front. Returns '' when it can't be a WhatsApp number. */
export function waNumber(raw?: string | null): string {
  let d = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10) d = `91${d}`;
  return /^\d{11,15}$/.test(d) ? d : '';
}

/** Replace {placeholders} in a message template. Unknown ones are left as they are. */
export function fillTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined || vars[k] === null ? all : String(vars[k])));
}

export const WA_PLACEHOLDERS = ['customer', 'company', 'invoice_no', 'date', 'amount', 'paid', 'balance', 'due_date', 'link', 'payment_amount', 'payment_mode'];

export const DEFAULT_WA_TEMPLATES = {
  invoice:
    'Dear {customer},\n\nThank you for your business. Please find your invoice *{invoice_no}* dated {date}.\nAmount: *{amount}*\nBalance due: {balance}\n\nView / download: {link}\n\nRegards,\n{company}',
  payment:
    'Dear {customer},\n\nWe have received *{payment_amount}* ({payment_mode}) against invoice {invoice_no}. Thank you!\nBalance now: {balance}\n\nRegards,\n{company}',
  reminder:
    'Dear {customer},\n\nThis is a gentle reminder that *{balance}* is pending against invoice {invoice_no} dated {date}.\nView invoice: {link}\n\nPlease ignore if already paid.\n{company}',
};
