import axios, { AxiosError } from 'axios';
import { message } from 'antd';

export const TOKEN_KEY = 'shouyin.token';
export const USER_KEY = 'shouyin.user';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'CASHIER' | 'STOCKER';
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): CurrentUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as CurrentUser) : null;
}

export function setSession(token: string, user: CurrentUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ message?: string | string[] }>) => {
    if (err.response?.status === 401) {
      clearSession();
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    } else {
      const raw = err.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? err.message;
      message.error(msg || '请求失败');
    }
    return Promise.reject(err);
  },
);
