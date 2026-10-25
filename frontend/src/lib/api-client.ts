export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export interface CurrentUserSession {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolTimezone: string;
  username: string;
  email: string;
  fullName: string;
  identifierCode: string | null;
  roles: string[];
}

export function getSavedAuth(): {
  accessToken: string | null;
  csrfToken: string | null;
  user: CurrentUserSession | null;
} {
  if (typeof window === 'undefined') {
    return { accessToken: null, csrfToken: null, user: null };
  }
  try {
    const raw = window.sessionStorage.getItem('cbt_pro_auth');
    if (!raw) return { accessToken: null, csrfToken: null, user: null };
    return JSON.parse(raw);
  } catch {
    return { accessToken: null, csrfToken: null, user: null };
  }
}

export function saveAuthSession(data: {
  accessToken: string;
  csrfToken: string;
  user: CurrentUserSession;
}): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('cbt_pro_auth', JSON.stringify(data));
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem('cbt_pro_auth');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const { accessToken, csrfToken } = getSavedAuth();
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      errMessage = errBody.message || errMessage;
    } catch {
      // ignore
    }
    throw new Error(errMessage);
  }

  return res.json() as Promise<T>;
}

export function formatSchoolTime(
  utcIsoString: string | null | undefined,
  timezone = 'Asia/Makassar',
): string {
  if (!utcIsoString) return '-';
  try {
    const date = new Date(utcIsoString);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(date);
  } catch {
    return utcIsoString;
  }
}

export function formatCountdownHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
