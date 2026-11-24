import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Plus, Save, Star, Trash2 } from 'lucide-react';
import { COLOR_THEMES, FONTS, PRESETS, SAMPLE_PRINT, renderInvoiceHtml, resolveTemplate, type PresetKey, type TemplateConfig } from '@gst/shared';
import { api, useSave } from '@/lib/api';
import { useCompany } from '@/lib/hooks';
import { InvoicePreview } from '@/components/InvoicePreview';
import { Badge, Confirm, Field, Loading, Modal, PageHeader, Spinner, Switch, cx } from '@/components/ui';

interface Tpl {
  id: string;
  name: string;
  config: Partial<TemplateConfig>;
  isDefault: boolean;
}

const SHOW_LABELS: [keyof TemplateConfig['show'], string][] = [
  ['logo', 'Logo'],
  ['companyAddress', 'Company address'],
  ['companyContact', 'Company phone / email'],
  ['customerContact', 'Customer phone / email'],
  ['dueDate', 'Due date'],
  ['hsn', 'HSN / SAC column'],
  ['unit', 'Unit with qty'],
  ['discount', 'Discount column (when used)'],
  ['lineTax', 'Tax amount per line'],
  ['taxSummary', 'GST rate-wise summary'],
  ['amountInWords', 'Amount in words'],
  ['bankDetails', 'Bank details'],
  ['upiQr', 'UPI Scan & Pay QR'],
  ['paidBalance', 'Received / balance & status'],
  ['notes', 'Notes'],
  ['terms', 'Terms & conditions'],
  ['signature', 'Signature block'],
];

export default function Templates() {
  const list = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Tpl[]>('/api/templates') });
  const company = useCompany();
  const [editing, setEditing] = useState<{ id?: string; name: string; config: TemplateConfig; isDefault: boolean } | null>(null);
  const [pick, setPick] = useState(false);
  const [del, setDel] = useState<Tpl | null>(null);
  const save = useSave<Tpl>({ invalidate: ['templates'], success: 'Template saved' });
  const remove = useSave({ invalidate: ['templates'], success: 'Template deleted', onSuccess: () => setDel(null) });

  const sample = useMemo(() => {
    const c = company.data ?? {};
    return { ...SAMPLE_PRINT, company: { ...SAMPLE_PRINT.company, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v)) } } as typeof SAMPLE_PRINT;
  }, [company.data]);

  if (list.isLoading || company.isLoading) return <Loading />;

  if (editing) return <Editor tpl={editing} sample={sample} onBack={() => setEditing(null)} onSave={(t) => save.mutate({ method: t.id ? 'put' : 'post', url: t.id ? `/api/templates/${t.id}` : '/api/templates', body: t }, { onSuccess: (r) => setEditing({ ...t, id: r.id }) })} saving={save.isPending} />;

  return (
    <div>
      <PageHeader title="Invoice Templates" subtitle="Choose a design, colours and what to show. The default one is used for print, PDF and WhatsApp." actions={<button className="btn-primary" onClick={() => setPick(true)}><Plus className="h-4 w-4" /> New template</button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(list.data ?? []).map((t) => {
          const cfg = resolveTemplate(t.config);
          return (
            <div key={t.id} className="card overflow-hidden">
              <button className="block h-64 w-full overflow-hidden border-b border-line bg-white text-left" onClick={() => setEditing({ id: t.id, name: t.name, config: cfg, isDefault: t.isDefault })}>
                <div className="pointer-events-none"><InvoicePreview html={renderInvoiceHtml(sample, cfg)} thermal={cfg.preset === 'thermal'} /></div>
              </button>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-slate-500">{PRESETS[cfg.preset]?.name} · {cfg.pageSize}</div>
                </div>
                {t.isDefault ? <Badge status="active">Default</Badge> : <button className="rounded p-1.5 text-slate-400 hover:text-amber-500" title="Make default" onClick={() => save.mutate({ method: 'put', url: `/api/templates/${t.id}`, body: { name: t.name, config: t.config, isDefault: true } })}><Star className="h-4 w-4" /></button>}
                <button className="rounded p-1.5 text-slate-400 hover:text-slate-700" title="Duplicate" onClick={() => setEditing({ name: `${t.name} copy`, config: cfg, isDefault: false })}><Copy className="h-4 w-4" /></button>
                {!t.isDefault && <button className="rounded p-1.5 text-slate-400 hover:text-red-600" title="Delete" onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <Modal open={pick} onClose={() => setPick(false)} title="Start from a design" size="xl">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
            <button key={k} className="overflow-hidden rounded-xl border border-line text-left transition hover:border-brand-600 hover:shadow" onClick={() => { setPick(false); setEditing({ name: PRESETS[k].name, config: PRESETS[k].config, isDefault: false }); }}>
              <div className="pointer-events-none h-56 overflow-hidden border-b border-line bg-white"><InvoicePreview html={renderInvoiceHtml(sample, PRESETS[k].config)} thermal={k === 'thermal'} /></div>
              <div className="px-3 py-2"><div className="text-sm font-semibold">{PRESETS[k].name}</div><div className="text-xs text-slate-500">{PRESETS[k].description}</div></div>
            </button>
          ))}
        </div>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete template?" text={`“${del?.name}” will be removed.`} danger confirmText="Delete" busy={remove.isPending} onConfirm={() => del && remove.mutate({ method: 'del', url: `/api/templates/${del.id}` })} />
    </div>
  );
}

function Editor({ tpl, sample, onBack, onSave, saving }: { tpl: { id?: string; name: string; config: TemplateConfig; isDefault: boolean }; sample: typeof SAMPLE_PRINT; onBack: () => void; onSave: (t: { id?: string; name: string; config: TemplateConfig; isDefault: boolean }) => void; saving: boolean }) {
  const [name, setName] = useState(tpl.name);
  const [cfg, setCfg] = useState<TemplateConfig>(tpl.config);
  const [isDefault, setIsDefault] = useState(tpl.isDefault);
  const [tab, setTab] = useState<'design' | 'preview'>('design');
  const html = useMemo(() => renderInvoiceHtml(sample, cfg), [sample, cfg]);
  const set = <K extends keyof TemplateConfig>(k: K, v: TemplateConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const thermal = cfg.preset === 'thermal';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button className="btn-ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Templates</button>
        <button className="btn-primary" disabled={saving || !name.trim()} onClick={() => onSave({ id: tpl.id, name: name.trim(), config: cfg, isDefault })}>{saving ? <Spinner /> : <Save className="h-4 w-4" />} Save template</button>
      </div>
      <div className="mb-3 flex gap-1 lg:hidden">
        {(['design', 'preview'] as const).map((t) => <button key={t} className={cx('flex-1 rounded-lg py-2 text-sm font-semibold capitalize', tab === t ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-line')} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className={cx('space-y-4', tab !== 'design' && 'hidden lg:block')}>
          <div className="card space-y-3 p-4">
            <Field label="Template name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Switch checked={isDefault} onChange={setIsDefault} label="Use as default" />
            <Field label="Design">
              <select className="input" value={cfg.preset} onChange={(e) => { const k = e.target.value as PresetKey; setCfg({ ...PRESETS[k].config, primaryColor: k === 'thermal' ? '#000000' : cfg.primaryColor, title: cfg.title, footerText: cfg.footerText }); }}>
                {(Object.keys(PRESETS) as PresetKey[]).map((k) => <option key={k} value={k}>{PRESETS[k].name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title"><input className="input" value={cfg.title} onChange={(e) => set('title', e.target.value)} /></Field>
              <Field label="Copy label"><input className="input" value={cfg.copyLabel} onChange={(e) => set('copyLabel', e.target.value)} placeholder="Original for Recipient" /></Field>
            </div>
          </div>
          <div className="card space-y-3 p-4">
            <div>
              <div className="label">Colour</div>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_THEMES.map((c) => <button key={c} className={cx('h-7 w-7 rounded-full ring-offset-2', cfg.primaryColor === c && 'ring-2 ring-slate-900')} style={{ background: c }} onClick={() => set('primaryColor', c)} aria-label={c} />)}
                <input type="color" className="h-8 w-10 cursor-pointer rounded border border-line" value={cfg.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Font">
                <select className="input" value={cfg.fontFamily} onChange={(e) => set('fontFamily', e.target.value)}>{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}</select>
              </Field>
              <Field label={`Font size (${cfg.fontSize}px)`}><input type="range" min={8} max={14} step={0.5} className="w-full" value={cfg.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} /></Field>
              <Field label="Paper">
                <select className="input" value={cfg.pageSize} onChange={(e) => set('pageSize', e.target.value as TemplateConfig['pageSize'])}> 
                  {thermal ? <><option value="80mm">80 mm roll</option><option value="58mm">58 mm roll</option></> : <><option value="A4">A4</option><option value="A5">A5</option></>}
                </select>
              </Field>
              <Field label="Header">
                <select className="input" value={cfg.headerAlign} onChange={(e) => set('headerAlign', e.target.value as 'left' | 'center')}><option value="left">Logo left</option><option value="center">Centred</option></select>
              </Field>
            </div>
          </div>
          <div className="card p-4">
            <div className="label">Show on invoice</div>
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-1">
              {SHOW_LABELS.map(([k, l]) => <Switch key={k} checked={cfg.show[k]} onChange={(v) => setCfg((c) => ({ ...c, show: { ...c.show, [k]: v } }))} label={<span className="text-[13px] font-normal">{l}</span>} />)}
            </div>
          </div>
          <div className="card space-y-3 p-4">
            <Field label="Signature label"><input className="input" value={cfg.signatureLabel} onChange={(e) => set('signatureLabel', e.target.value)} /></Field>
            <Field label="Footer text"><input className="input" value={cfg.footerText} onChange={(e) => set('footerText', e.target.value)} /></Field>
          </div>
        </div>
        <div className={cx('lg:sticky lg:top-20 lg:self-start', tab !== 'preview' && 'hidden lg:block')}>
          <div className="card overflow-hidden bg-slate-100 p-2 sm:p-4">
            <div className="mx-auto bg-white shadow" style={{ maxWidth: thermal ? 340 : undefined }}>
              <InvoicePreview html={html} thermal={thermal} />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">Preview with sample items and your company details</p>
        </div>
      </div>
    </div>
  );
}
