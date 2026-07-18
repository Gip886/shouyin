import axios, { AxiosError } from 'axios';
import { message } from 'antd';
import { resolveApiBaseUrl } from './serverConfig';

// 与 admin 分离，避免共用登录态互相踩
export const TOKEN_KEY = 'shouyin.pos.token';
export const USER_KEY = 'shouyin.pos.user';

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

// baseURL 启动时从 localStorage 决定:配了绝对 URL 用它,没配用同源 /api
export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15000,
});

/** 员工在设置页改完地址后调用,让后续请求立刻用新值,不用刷新页面 */
export function applyServerBaseUrl() {
  api.defaults.baseURL = resolveApiBaseUrl();
}

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
      // 扫码/结账错误统一由调用处提示，这里只兜底非 401 的网络错等
      if (!err.config?.url?.includes('/pos/')) {
        message.error(msg || '请求失败');
      }
    }
    return Promise.reject(err);
  },
);
