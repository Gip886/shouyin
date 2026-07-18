// POS 端服务器地址配置。
//
// 单机部署时,前后端挂同一 nginx 域名,员工什么都不用做 —— fallback 是当前页同源 + /api。
// 多机部署时(比如后端在 A 机、pos 在 B 机的浏览器打开),
// 员工登录页会有"服务器地址"链接,填一次绝对 URL 存 localStorage,后续都用它。
//
// 与 mobile 端不同:pos 是浏览器,localStorage 够用,不需要 Capacitor Preferences。
// QR 扫码那套员工体验也不适用(前台就是电脑,员工直接看得到管理员输入框),所以只做手输。

const KEY = 'shouyin.pos.serverBaseUrl';

/** 读取当前配置的绝对 URL(根 URL,不含 /api)。空字符串表示用同源 */
export function getServerBaseUrl(): string {
  return localStorage.getItem(KEY) ?? '';
}

export function setServerBaseUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, '');
  if (!clean) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, clean);
  }
}

export function clearServerBaseUrl() {
  localStorage.removeItem(KEY);
}

/**
 * 生效逻辑:
 *  - 配置了绝对 URL(比如 http://192.168.31.112:3001)→ 用它 + /api
 *  - 没配 → 用相对路径 /api,靠 vite dev proxy(dev)或 nginx 反代(生产)
 */
export function resolveApiBaseUrl(): string {
  const configured = getServerBaseUrl();
  return configured ? `${configured}/api` : '/api';
}

/** 探活:不走 axios,避免拦截器把 401/404 判成"该跳登录" */
export async function pingServer(
  baseUrl: string,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!clean) return { ok: false, error: '请填服务器地址' };
  if (!/^https?:\/\//i.test(clean)) {
    return { ok: false, error: '必须以 http:// 或 https:// 开头' };
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
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
          ? '连接超时(4 秒)'
          : e?.message ?? '无法连接',
    };
  } finally {
    clearTimeout(t);
  }
}
