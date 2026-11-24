import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, IndianRupee, MessageCircle, Smartphone } from 'lucide-react';
import { api, errText } from '@/lib/api';
import { useAuth, toast, type Session } from '@/lib/store';
import { Field, Modal, Spinner } from '@/components/ui';

export function useBranding() {
  return useQuery({ queryKey: ['branding'], queryFn: () => api.get<{ appName: string; supportPhone: string; supportEmail: string; tagline: string }>('/api/public/branding'), staleTime: 300_000 });
}

export default function Login() {
  const nav = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const b = useBranding().data;
  const [f, setF] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reqOpen, setReqOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api.post<{ token: string } & Session>('/api/auth/login', f);
      setAuth(r.token, r);
      nav(r.user.role === 'superadmin' ? '/admin' : '/', { replace: true });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="bg-brand-900 px-6 py-8 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
        <div className="text-2xl font-extrabold tracking-tight lg:text-4xl">{b?.appName ?? 'GST Invoice'}</div>
        <p className="mt-1 text-sm text-slate-300 lg:mt-3 lg:text-lg">{b?.tagline || 'Simple GST billing for small businesses — from your phone or computer.'}</p>
        <ul className="mt-8 hidden space-y-4 text-slate-200 lg:block">
          <li className="flex gap-3"><FileText className="h-5 w-5 text-brand-500" /> GST invoices with CGST / SGST / IGST in seconds</li>
          <li className="flex gap-3"><IndianRupee className="h-5 w-5 text-brand-500" /> Track payments and outstanding dues</li>
          <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-brand-500" /> Send invoices & reminders on WhatsApp</li>
          <li className="flex gap-3"><Smartphone className="h-5 w-5 text-brand-500" /> Works on mobile — no app install needed</li>
        </ul>
      </div>
      <div className="flex flex-1 items-start justify-center px-4 py-8 lg:items-center">
        <form onSubmit={submit} className="card w-full max-w-sm p-6 shadow-sm">
          <h1 className="text-xl font-bold">Sign in</h1>
          <p className="mb-5 text-sm text-slate-500">Use the username and password given to you.</p>
          <div className="space-y-3">
            <Field label="Username">
              <input className="input" autoCapitalize="none" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus />
            </Field>
            <Field label="Password">
              <input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <button className="btn-primary w-full py-2.5" disabled={busy || !f.username || !f.password}>
              {busy && <Spinner />} Sign in
            </button>
          </div>
          <div className="mt-6 border-t border-line pt-4 text-center text-sm text-slate-600">
            New business?{' '}
            <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setReqOpen(true)}>
              Request an account
            </button>
            {b?.supportPhone && <div className="mt-1 text-xs text-slate-500">Support: {b.supportPhone}</div>}
          </div>
        </form>
      </div>
      <RequestAccess open={reqOpen} onClose={() => setReqOpen(false)} />
    </div>
  );
}

function RequestAccess({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: '', businessName: '', phone: '', email: '', city: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/api/public/access-request', f);
      setDone(true);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request an account"
      footer={
        done ? (
          <button className="btn-primary" onClick={onClose}>Close</button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={busy}>{busy && <Spinner />} Send request</button>
          </>
        )
      }
    >
      {done ? (
        <p className="py-6 text-center text-sm text-slate-600">Thank you! We will call you shortly and share your login details.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Business name" required><input className="input" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
          <Field label="Mobile" required><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Email" className="sm:col-span-2"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Message" className="sm:col-span-2"><textarea className="input" rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        </div>
      )}
    </Modal>
  );
}
