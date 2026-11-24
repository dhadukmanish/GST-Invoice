import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bell, CalendarPlus, KeyRound, LogIn, Pause, Play, Plus, Save, Trash2 } from 'lucide-react';
import { fmtDate, money, stateName, todayIST } from '@gst/shared';
import { api, errText, queryClient, useSave } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Badge, Confirm, Field, Loading, Modal, Spinner, Switch } from '@/components/ui';
import { CredentialsModal, tenantState } from './Clients';

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['admin-tenant', id], queryFn: () => api.get<any>(`/api/admin/tenants/${id}`) });
  const [f, setF] = useState<any>(null);
  const [userEdit, setUserEdit] = useState<any>(null);
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [del, setDel] = useState(false);
  const [delText, setDelText] = useState('');
  const [customDate, setCustomDate] = useState('');
  const inval = ['admin-tenant', 'admin-tenants', 'admin-stats'];
  const save = useSave({ invalidate: inval, success: 'Saved' });
  const act = useSave({ invalidate: inval });
  useEffect(() => {
    if (q.data) setF({ businessName: q.data.businessName, contactName: q.data.contactName, phone: q.data.phone, email: q.data.email, plan: q.data.plan, validUntil: q.data.validUntil, maxUsers: q.data.maxUsers, whatsappAllowed: q.data.whatsappAllowed, notes: q.data.notes, stateCode: '', gstin: '' });
  }, [q.data]);
  if (q.isLoading || !f) return <Loading />;
  const t = q.data;
  const state = tenantState(t);

  const impersonate = async () => {
    try {
      const r = await api.post<any>(`/api/admin/tenants/${id}/impersonate`);
      useAuth.getState().impersonate(r.token, r);
      queryClient.clear();
      nav('/');
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const resetPw = async (u: any) => {
    try {
      const r = await api.post<{ username: string; password: string }>(`/api/admin/users/${u.id}/reset-password`);
      setCreds(r);
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const remind = async () => {
    const r = await api.post<{ ok: boolean; text: string; error?: string }>(`/api/admin/tenants/${id}/remind`).catch((e) => ({ ok: false, text: '', error: errText(e) }));
    r.ok ? toast.success('Renewal reminder queued on WhatsApp') : toast.error(r.error ?? 'Could not send');
  };

  return (
    <div className="space-y-4">
      <button className="btn-ghost -ml-2" onClick={() => nav('/admin')}><ArrowLeft className="h-4 w-4" /> Clients</button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-bold">{t.businessName}</h1><Badge status={state} /></div>
          <div className="text-sm text-slate-500">Valid till <b>{fmtDate(t.validUntil, true)}</b> ({t.daysLeft} days) · since {fmtDate(t.validFrom, true)}</div>
          <div className="text-xs text-slate-500">{[t.company?.gstin || 'No GSTIN', stateName(t.company?.stateCode)].filter(Boolean).join(' · ')} · {t.usage.invoices} invoices · {t.usage.customers} customers · sales {money(t.usage.sales)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={impersonate}><LogIn className="h-4 w-4" /> Login as client</button>
          <button className="btn-secondary" onClick={remind}><Bell className="h-4 w-4" /> Renewal reminder</button>
          {t.status === 'active' ? (
            <button className="btn-danger" onClick={() => act.mutate({ method: 'post', url: `/api/admin/tenants/${id}/status`, body: { status: 'suspended' } }, { onSuccess: () => toast.success('Suspended') })}><Pause className="h-4 w-4" /> Suspend</button>
          ) : (
            <button className="btn-primary" onClick={() => act.mutate({ method: 'post', url: `/api/admin/tenants/${id}/status`, body: { status: 'active' } }, { onSuccess: () => toast.success('Activated') })}><Play className="h-4 w-4" /> Activate</button>
          )}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarPlus className="h-4 w-4" /> Extend validity</h3>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 3, 6, 12].map((m) => (
            <button key={m} className="btn-secondary" disabled={act.isPending} onClick={() => act.mutate({ method: 'post', url: `/api/admin/tenants/${id}/extend`, body: { months: m } }, { onSuccess: (r: any) => toast.success(`Valid till ${fmtDate(r.validUntil)}`) })}>
              +{m} {m === 1 ? 'month' : 'months'}
            </button>
          ))}
          <input type="date" className="input w-40" value={customDate} min={todayIST()} onChange={(e) => setCustomDate(e.target.value)} />
          <button className="btn-primary" disabled={!customDate || act.isPending} onClick={() => act.mutate({ method: 'post', url: `/api/admin/tenants/${id}/extend`, body: { validUntil: customDate } }, { onSuccess: () => toast.success('Validity updated') })}>Set date</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Extension starts from the current end date (or today if already expired). After the date, the client cannot sign in until renewed — their data stays safe.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-4">
          <h3 className="text-sm font-semibold">Account details</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" className="sm:col-span-2"><input className="input" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
            <Field label="Contact person"><input className="input" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
            <Field label="Mobile"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Plan"><input className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} /></Field>
            <Field label="Valid till"><input className="input" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
            <Field label="Max users"><input className="input" type="number" min={1} value={f.maxUsers} onChange={(e) => setF({ ...f, maxUsers: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2"><Switch checked={f.whatsappAllowed} onChange={(v) => setF({ ...f, whatsappAllowed: v })} label="Allow shared platform WhatsApp" hint="Used only when the client has no own API token and platform sharing is on" /></div>
            <Field label="Internal notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ method: 'put', url: `/api/admin/tenants/${id}`, body: f })}>{save.isPending ? <Spinner /> : <Save className="h-4 w-4" />} Save</button>
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h3 className="text-sm font-semibold">Users ({t.users.length}/{t.maxUsers})</h3>
              <button className="btn-secondary btn-sm" onClick={() => setUserEdit({ name: '', username: '', password: '', role: 'staff', isActive: true })}><Plus className="h-4 w-4" /> Add</button>
            </div>
            <div className="divide-y divide-slate-100">
              {t.users.map((u: any) => (
                <div key={u.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setUserEdit({ ...u, password: '' })}>
                    <div className="font-medium">{u.name} <span className="text-xs text-slate-500">({u.role})</span></div>
                    <div className="text-xs text-slate-500">{u.username} · last login {u.lastLoginAt ? fmtDate(u.lastLoginAt.slice(0, 10)) : 'never'}</div>
                  </button>
                  {!u.isActive && <Badge status="suspended">off</Badge>}
                  <button className="btn-ghost btn-sm" onClick={() => resetPw(u)} title="Reset password"><KeyRound className="h-4 w-4" /> Reset</button>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">Recent activity</div>
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs">
              {t.activity.map((a: any) => (
                <div key={a.id} className="flex justify-between gap-2 px-4 py-2"><span><b>{a.action}</b> {a.detail}</span><span className="shrink-0 text-slate-400">{new Date(a.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
              ))}
              {!t.activity.length && <div className="p-4 text-center text-slate-500">No activity yet</div>}
            </div>
          </div>
          <div className="card border-red-200 p-4">
            <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
            <p className="mb-2 text-xs text-slate-500">Deletes the client with all invoices, customers and payments. Cannot be undone.</p>
            <button className="btn-danger" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Delete client</button>
          </div>
        </div>
      </div>

      <Modal
        open={!!userEdit}
        onClose={() => setUserEdit(null)}
        title={userEdit?.id ? 'Edit user' : 'Add user'}
        size="sm"
        footer={
          <>
            {userEdit?.id && <button className="btn-danger mr-auto" onClick={() => act.mutate({ method: 'del', url: `/api/admin/users/${userEdit.id}` }, { onSuccess: () => { setUserEdit(null); toast.success('User deleted'); } })}>Delete</button>}
            <button className="btn-secondary" onClick={() => setUserEdit(null)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={act.isPending}
              onClick={() =>
                act.mutate(
                  { method: userEdit.id ? 'put' : 'post', url: userEdit.id ? `/api/admin/users/${userEdit.id}` : `/api/admin/tenants/${id}/users`, body: userEdit },
                  { onSuccess: () => { if (userEdit.password) setCreds({ username: userEdit.username, password: userEdit.password }); setUserEdit(null); toast.success('User saved'); } },
                )
              }
            >
              Save
            </button>
          </>
        }
      >
        {userEdit && (
          <div className="space-y-3">
            <Field label="Name"><input className="input" value={userEdit.name} onChange={(e) => setUserEdit({ ...userEdit, name: e.target.value })} /></Field>
            <Field label="Username"><input className="input" autoCapitalize="none" value={userEdit.username} onChange={(e) => setUserEdit({ ...userEdit, username: e.target.value.toLowerCase() })} /></Field>
            <Field label={userEdit.id ? 'New password (blank = keep)' : 'Password'}><input className="input" value={userEdit.password} onChange={(e) => setUserEdit({ ...userEdit, password: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={userEdit.role} onChange={(e) => setUserEdit({ ...userEdit, role: e.target.value })}><option value="admin">Admin</option><option value="staff">Staff</option></select></Field>
            <Switch checked={userEdit.isActive} onChange={(v) => setUserEdit({ ...userEdit, isActive: v })} label="Active" />
          </div>
        )}
      </Modal>
      {creds && <CredentialsModal open onClose={() => setCreds(null)} tenantId={t.id} username={creds.username} password={creds.password} phone={t.phone} name={t.contactName || t.businessName} validUntil={t.validUntil} />}
      <Confirm open={del} onClose={() => setDel(false)} title="Delete client permanently?" danger confirmText="Delete forever" busy={act.isPending} onConfirm={() => act.mutate({ method: 'del', url: `/api/admin/tenants/${id}`, body: { confirm: delText } }, { onSuccess: () => { toast.success('Client deleted'); nav('/admin'); } })}>
        <p className="mb-2 text-sm text-slate-600">Type <b>{t.businessName}</b> to confirm.</p>
        <input className="input" value={delText} onChange={(e) => setDelText(e.target.value)} />
      </Confirm>
    </div>
  );
}
