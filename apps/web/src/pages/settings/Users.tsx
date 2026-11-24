import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useSave } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { Badge, Confirm, Field, Loading, Modal, PageHeader, Spinner, Switch } from '@/components/ui';

export default function Users() {
  const me = useAuth((s) => s.session);
  const list = useQuery({ queryKey: ['users'], queryFn: () => api.get<any[]>('/api/users') });
  const [edit, setEdit] = useState<any>(null);
  const [del, setDel] = useState<any>(null);
  const save = useSave({ invalidate: ['users'], success: 'User saved', onSuccess: () => setEdit(null) });
  const remove = useSave({ invalidate: ['users'], success: 'User deleted', onSuccess: () => setDel(null) });
  if (list.isLoading) return <Loading />;
  const max = me?.tenant?.maxUsers ?? 1;
  const n = list.data?.length ?? 0;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Users" subtitle={`${n} of ${max} users in your plan`} actions={<button className="btn-primary" disabled={n >= max} onClick={() => setEdit({ name: '', username: '', password: '', role: 'staff', isActive: true })}><Plus className="h-4 w-4" /> Add user</button>} />
      <div className="card divide-y divide-slate-100">
        {list.data!.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{u.name} {u.id === me?.user.id && <span className="text-xs font-normal text-slate-500">(you)</span>}</div>
              <div className="text-xs text-slate-500">{u.username} · last login {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}</div>
            </div>
            <Badge status={u.isActive ? 'active' : 'suspended'}>{u.role}</Badge>
            <button className="rounded p-2 text-slate-500 hover:bg-slate-100" onClick={() => setEdit({ ...u, password: '' })}><Pencil className="h-4 w-4" /></button>
            {u.id !== me?.user.id && <button className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setDel(u)}><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Staff can make invoices and record payments. Only admins can change settings, templates and users. Need more users? Contact support.</p>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit user' : 'Add user'}
        size="sm"
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate({ method: edit.id ? 'put' : 'post', url: edit.id ? `/api/users/${edit.id}` : '/api/users', body: edit })}>{save.isPending && <Spinner />} Save</button></>}
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Username" hint="Used to sign in (must be unique)"><input className="input" autoCapitalize="none" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase() })} /></Field>
            <Field label={edit.id ? 'New password (leave blank to keep)' : 'Password'}><input className="input" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select></Field>
            <Switch checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Active" />
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete user?" text={`${del?.name} (${del?.username}) will no longer be able to sign in.`} danger confirmText="Delete" busy={remove.isPending} onConfirm={() => remove.mutate({ method: 'del', url: `/api/users/${del.id}` })} />
    </div>
  );
}
