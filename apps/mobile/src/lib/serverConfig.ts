import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

/**
 * 服务器地址(baseURL)配置。
 *
 * - Web(浏览器直连):固定用 vite 代理 '/api',用不到 Preferences。
 * - Native(APK):首次启动没有配置 → 让用户扫 QR 拿到 http://192.168.x.x:3001,
 *   写入 Capacitor Preferences(= Android SharedPreferences),持久且不会被 WebView 清。
 *
 * 存的时候 **只存根 URL(不含 /api)**,axios baseURL 拼上去。这样 QR 也是根 URL,
 * 换后端时(比如迁移到 https 或换端口)可以只改一处。
 */

const KEY = 'shouyin.serverBaseUrl';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function getServerBaseUrl(): Promise<string | null> {
  if (!isNative()) return '/api';
  const { value } = await Preferences.get({ key: KEY });
  return value || null;
}

/**
 * 规范化并写入。不主动 ping(校验交给调用方,通常先 pingServer 再 set)。
 */
export async function setServerBaseUrl(url: string): Promise<void> {
  const clean = normalize(url);
  await Preferences.set({ key: KEY, value: clean });
}

export async function clearServerBaseUrl(): Promise<void> {
  await Preferences.remove({ key: KEY });
}

/**
 * 校验一个 baseURL 底下是不是我们家的 API。
 * - 单独 fetch,不走 axios 拦截器,避免 401/404 触发全局 toast 或跳登录
 * - 3 秒超时,慢一点就算失败(设置页不该让人干等)
 */
export async function pingServer(
  baseUrl: string,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const clean = normalize(baseUrl);
  if (!/^https?:\/\//i.test(clean)) {
    return { ok: false, error: '地址需以 http:// 或 https:// 开头' };
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const res = await fetch(`${clean}/api/ping`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = await res.json();
    if (!j?.ok) return { ok: false, error: '响应格式不对' };
    return { ok: true, name: j.name };
  } catch (e: any) {
    return {
      ok: false,
      error:
        e?.name === 'AbortError'
          ? '连接超时(3 秒)'
          : e?.message ?? '无法连接',
    };
  } finally {
    clearTimeout(t);
  }
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
