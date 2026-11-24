import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X } from 'lucide-react';
import { money } from '@gst/shared';
import { useToast } from '@/lib/store';

export const cx = clsx;

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('animate-spin', className ?? 'h-4 w-4')} />;
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  );
}

export function Field({ label, children, hint, className, required }: { label: string; children: ReactNode; hint?: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {(label || hint) && (
        <span className="text-sm">
          <span className="font-medium text-slate-700">{label}</span>
          {hint && <span className="block text-xs text-slate-500">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', w)}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, onClose, onConfirm, title, text, confirmText = 'Confirm', danger, busy, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; text?: ReactNode; confirmText?: string; danger?: boolean; busy?: boolean; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />} {confirmText}
          </button>
        </>
      }
    >
      {text && <p className="text-sm text-slate-600">{text}</p>}
      {children}
    </Modal>
  );
}

const STATUS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  unpaid: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
  active: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-700',
  expiring: 'bg-amber-100 text-amber-800',
  suspended: 'bg-slate-200 text-slate-700',
  SENT: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  READ: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-slate-100 text-slate-600',
  new: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  rejected: 'bg-slate-200 text-slate-600',
};
export function Badge({ status, children, className }: { status?: string; children?: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide', STATUS[status ?? ''] ?? 'bg-slate-100 text-slate-700', className)}>{children ?? status}</span>;
}

export function Money({ v, className }: { v: number | string | null | undefined; className?: string }) {
  return <span className={cx('tabular-nums', className)}>{money(Number(v ?? 0))}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <div className="font-semibold text-slate-700">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition', t.value === value ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-line hover:bg-slate-50')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toasts() {
  const { toasts, remove } = useToast();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => remove(t.id)} className={cx('pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg', t.kind === 'error' ? 'bg-red-600' : t.kind === 'success' ? 'bg-slate-900' : 'bg-brand-700')}>
          {t.kind === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Searchable picker (customers / items). Works well on mobile. */
export function Combo<T>({
  items,
  value,
  onSelect,
  getKey,
  getLabel,
  renderItem,
  placeholder,
  onCreate,
  createLabel,
  className,
  autoFocus,
  onTextChange,
}: {
  items: T[];
  value: string;
  onSelect: (item: T) => void;
  getKey: (t: T) => string;
  getLabel: (t: T) => string;
  renderItem?: (t: T) => ReactNode;
  placeholder?: string;
  onCreate?: (text: string) => void;
  createLabel?: string;
  className?: string;
  autoFocus?: boolean;
  onTextChange?: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [hi, setHi] = useState(0);
  const [dirty, setDirty] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const q = text.trim().toLowerCase();
  const list = (q && dirty ? items.filter((i) => getLabel(i).toLowerCase().includes(q)) : items).slice(0, 50);
  const pick = (t: T) => {
    onSelect(t);
    setText(getLabel(t));
    setDirty(false);
    setOpen(false);
  };
  return (
    <div className={cx('relative', className)} ref={box}>
      <input
        className="input"
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={(e) => {
          setDirty(false);
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          onTextChange?.(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, list.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && list[hi]) {
            e.preventDefault();
            pick(list[hi]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {list.map((t, i) => (
            <button type="button" key={getKey(t)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)} className={cx('block w-full px-3 py-2 text-left text-sm', i === hi ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              {renderItem ? renderItem(t) : getLabel(t)}
            </button>
          ))}
          {!list.length && <div className="px-3 py-2 text-sm text-slate-500">No match</div>}
          {onCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreate(text);
                setOpen(false);
              }}
              className="block w-full border-t border-line px-3 py-2 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              + {createLabel ?? 'Add new'} {q && `“${text.trim()}”`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Stat tile. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'green' | 'amber' }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx('mt-1 text-xl font-bold tabular-nums sm:text-2xl', tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900')}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
