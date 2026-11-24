import { useState } from 'react';
import { api, errText } from '@/lib/api';
import { toast, useAuth } from '@/lib/store';
import { Field, PageHeader, Spinner } from '@/components/ui';

export default function Account() {
  const session = useAuth((s) => s.session);
  const setAuth = useAuth((s) => s.setAuth);
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      const r = await api.post<{ token: string }>('/api/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      if (session) setAuth(r.token, session);
      toast.success('Password changed');
      setF({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-md">
      <PageHeader title="My account" subtitle={`${session?.user.name} · ${session?.user.username}`} />
      {session?.tenant && (
        <div className="card mb-4 p-4 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Business</span><b>{session.tenant.businessName}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Plan</span><span>{session.tenant.plan || '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Valid till</span><span>{session.tenant.validUntil.split('-').reverse().join('-')} ({session.tenant.daysLeft} days)</span></div>
        </div>
      )}
      <form onSubmit={submit} className="card space-y-3 p-4">
        <h3 className="font-semibold">Change password</h3>
        <Field label="Current password"><input className="input" type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
        <Field label="New password" hint="At least 6 characters"><input className="input" type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
        <Field label="Confirm new password"><input className="input" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
        <button className="btn-primary" disabled={busy || !f.currentPassword || f.newPassword.length < 6}>{busy && <Spinner />} Change password</button>
      </form>
    </div>
  );
}
