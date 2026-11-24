import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast, useAuth } from './store';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, raw?: { contentType: string }): Promise<T> {
  const token = useAuth.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (raw) {
    headers['Content-Type'] = raw.contentType;
    payload = body as BodyInit;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    if (res.status === 401 && token && !url.endsWith('/login')) {
      useAuth.getState().logout();
    }
    throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body),
  upload: <T>(url: string, blob: Blob, contentType: string) => request<T>('POST', url, blob, { contentType }),
};

export const qs = (o: Record<string, unknown>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p.map(([k, v]) => [k, String(v)])).toString()}` : '';
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/** POST/PUT/DELETE + toast + invalidate. */
export function useSave<T = any>(opts: { invalidate?: string[]; success?: string; onSuccess?: (d: T) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method, url, body }: { method: 'post' | 'put' | 'del'; url: string; body?: unknown }) => (method === 'del' ? api.del<T>(url, body) : api[method]<T>(url, body)),
    onSuccess: (d) => {
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(d);
    },
    onError: (e) => toast.error(errText(e)),
  });
}
