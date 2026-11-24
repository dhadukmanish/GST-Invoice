import { create } from 'zustand';

export interface Session {
  user: { id: string; name: string; username: string; role: 'superadmin' | 'admin' | 'staff'; tenantId: string | null };
  tenant: null | { id: string; businessName: string; validUntil: string; daysLeft: number; plan: string; maxUsers: number; stateCode: string; setupDone: boolean };
  branding: Record<string, unknown>;
  impersonating?: boolean;
}

const TOKEN = 'gst.token';
const SU_TOKEN = 'gst.su_token';

interface AuthState {
  token: string | null;
  session: Session | null;
  setAuth: (token: string, session: Session) => void;
  setSession: (s: Session) => void;
  logout: () => void;
  /** Super admin "login as client": keep the super admin token to come back. */
  impersonate: (token: string, session: Session) => void;
  stopImpersonating: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN),
  session: null,
  setAuth: (token, session) => {
    localStorage.setItem(TOKEN, token);
    set({ token, session });
  },
  setSession: (session) => set({ session }),
  logout: () => {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(SU_TOKEN);
    set({ token: null, session: null });
  },
  impersonate: (token, session) => {
    const cur = get().token;
    if (cur) localStorage.setItem(SU_TOKEN, cur);
    localStorage.setItem(TOKEN, token);
    set({ token, session });
  },
  stopImpersonating: () => {
    const su = localStorage.getItem(SU_TOKEN);
    localStorage.removeItem(SU_TOKEN);
    if (su) localStorage.setItem(TOKEN, su);
    else localStorage.removeItem(TOKEN);
    set({ token: su, session: null });
  },
}));

type ToastKind = 'success' | 'error' | 'info';
interface ToastState {
  toasts: { id: number; kind: ToastKind; text: string }[];
  push: (kind: ToastKind, text: string) => void;
  remove: (id: number) => void;
}
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
export const toast = {
  success: (t: string) => useToast.getState().push('success', t),
  error: (t: string) => useToast.getState().push('error', t),
  info: (t: string) => useToast.getState().push('info', t),
};
