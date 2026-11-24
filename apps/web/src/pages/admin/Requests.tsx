import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, MessageCircle, Phone, UserPlus, X } from 'lucide-react';
import { waNumber } from '@gst/shared';
import { api, useSave } from '@/lib/api';
import { Badge, Loading, PageHeader } from '@/components/ui';
import { CreateClient } from './Clients';

export default function Requests() {
  const q = useQuery({ queryKey: ['admin-requests'], queryFn: () => api.get<any[]>('/api/admin/requests') });
  const act = useSave({ invalidate: ['admin-requests', 'admin-stats'] });
  const [create, setCreate] = useState<any>(null);
  if (q.isLoading) return <Loading />;
  return (
    <div>
      <PageHeader title="Account requests" subtitle="From the “Request an account” form on the login page" />
      <div className="card divide-y divide-slate-100">
        {(q.data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="font-semibold">{r.businessName}</span><Badge status={r.status} /></div>
              <div className="text-xs text-slate-500">{r.name} · {r.phone} {r.city && `· ${r.city}`} {r.email && `· ${r.email}`} · {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              {r.message && <div className="mt-0.5 text-sm text-slate-600">{r.message}</div>}
            </div>
            <div className="flex gap-1">
              <a className="btn-ghost btn-sm" href={`tel:${r.phone}`}><Phone className="h-4 w-4" /></a>
              {waNumber(r.phone) && <a className="btn-ghost btn-sm text-[#1a9e4b]" target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(r.phone)}`}><MessageCircle className="h-4 w-4" /></a>}
              {r.status === 'new' && (
                <>
                  <button className="btn-primary btn-sm" onClick={() => setCreate(r)}><UserPlus className="h-4 w-4" /> Create account</button>
                  <button className="btn-secondary btn-sm" title="Mark done" onClick={() => act.mutate({ method: 'post', url: `/api/admin/requests/${r.id}`, body: { status: 'done' } })}><Check className="h-4 w-4" /></button>
                  <button className="btn-secondary btn-sm" title="Reject" onClick={() => act.mutate({ method: 'post', url: `/api/admin/requests/${r.id}`, body: { status: 'rejected' } })}><X className="h-4 w-4" /></button>
                </>
              )}
            </div>
          </div>
        ))}
        {!q.data?.length && <div className="p-8 text-center text-sm text-slate-500">No requests yet</div>}
      </div>
      <CreateClient open={!!create} prefill={create} onClose={() => setCreate(null)} />
    </div>
  );
}
