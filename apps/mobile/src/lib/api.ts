import axios, { AxiosError } from 'axios';
import { Toast } from 'antd-mobile';
import { getServerBaseUrl, isNative } from './serverConfig';

export const TOKEN_KEY = 'shouyin.mobile.token';
export const USER_KEY = 'shouyin.mobile.user';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'CASHIER' | 'STOCKER';
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getCurrentUser = (): CurrentUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as CurrentUser) : null;
};
export const setSession = (token: string, user: CurrentUser) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// baseURL 在 initApiBaseUrl() 里补:
//  - Web 端:'/api'(靠 vite dev proxy 或同源 nginx)
//  - Native 端:'http://192.168.x.x:3001/api'(从 Preferences 拿根 URL 再拼 /api)
// 启动时若拿不到,baseURL 就是 undefined,任何调用都会失败 —— boot gate 会先跳 /setup,
// 员工先扫 QR 配好再进主流程,不会走到这里。
export const api = axios.create({ timeout: 15000 });

/**
 * 应用启动时调用一次。返回 true = 已配好,可以进主流程;false = 需要引导到 /setup。
 */
export async function initApiBaseUrl(): Promise<boolean> {
  const root = await getServerBaseUrl();
  if (!root) return false;
  api.defaults.baseURL = isNative() ? `${root}/api` : root;
  return true;
}

/**
 * 用户在 /setup 页扫码/手动填成功后调用,让后续请求立即用新地址,不用重启 app。
 */
export function applyServerBaseUrl(rootUrl: string) {
  api.defaults.baseURL = isNative() ? `${rootUrl}/api` : '/api';
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
      // HashRouter:改路由用 hash;'/#/login' 才能被 react-router 接住
      if (!location.hash.startsWith('#/login')) {
        location.hash = '#/login';
      }
    } else {
      const raw = err.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('；') : raw ?? err.message;
      Toast.show({ icon: 'fail', content: msg || '请求失败' });
    }
    return Promise.reject(err);
  },
);
