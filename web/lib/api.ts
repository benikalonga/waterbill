'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export type Audience = 'customer' | 'staff';
const KEY = (a: Audience) => `wb.session.${a}`;

export interface Session {
  accessToken: string;
  refreshToken: string;
  profile: any;
}

export const session = {
  get(a: Audience): Session | null {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem(KEY(a)) || 'null');
    } catch {
      return null;
    }
  },
  set(a: Audience, value: Session) {
    localStorage.setItem(KEY(a), JSON.stringify(value));
  },
  clear(a: Audience) {
    localStorage.removeItem(KEY(a));
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const LOGIN = { customer: '/sign-in', staff: '/sign-in?as=staff' };
const inFlight: Partial<Record<Audience, Promise<boolean>>> = {};

/** Swap the refresh token for a new pair. Concurrent callers share one attempt. */
function refresh(a: Audience): Promise<boolean> {
  inFlight[a] ??= (async () => {
    const current = session.get(a);
    if (!current) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) return false;
      session.set(a, { ...current, ...(await res.json()) });
      return true;
    } catch {
      return false;
    } finally {
      delete inFlight[a];
    }
  })();
  return inFlight[a]!;
}

export async function request<T = any>(a: Audience | null, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () =>
    fetch(`${API_URL}/api${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...(a && session.get(a) ? { authorization: `Bearer ${session.get(a)!.accessToken}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && a && session.get(a) && (await refresh(a))) res = await send();
  } catch {
    throw new ApiError('You appear to be offline. Please check your connection.', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && a && session.get(a)) {
    session.clear(a);
    window.location.href = LOGIN[a];
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status);
  return data as T;
}

export const portal = <T = any>(path: string, init?: { method?: string; body?: unknown }) => request<T>('customer', `/portal${path}`, init);
export const ops = <T = any>(path: string, init?: { method?: string; body?: unknown }) => request<T>('staff', `/ops${path}`, init);
export const field = <T = any>(path: string, init?: { method?: string; body?: unknown }) => request<T>('staff', `/field${path}`, init);
export const open = <T = any>(path: string, init?: { method?: string; body?: unknown }) => request<T>(null, path, init);
