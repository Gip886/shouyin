import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd-mobile';
import zhCN from 'antd-mobile/es/locales/zh-CN';
import './index.css';
import App from './App';
import { initApiBaseUrl } from './lib/api';
import { isNative } from './lib/serverConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Boot gate:
// - Web:baseURL 直接就是 /api,initApiBaseUrl 立刻返回 true
// - Native:从 Preferences 读服务器根 URL;没配就把 hash 定到 #/setup,
//   由 App 里的 <Route path="/setup"> 接管,员工先扫 QR 才能进主流程
async function boot() {
  const configured = await initApiBaseUrl();
  if (isNative() && !configured) {
    location.hash = '#/setup';
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ConfigProvider locale={zhCN}>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <App />
          </HashRouter>
        </QueryClientProvider>
      </ConfigProvider>
    </React.StrictMode>,
  );
}

boot();
