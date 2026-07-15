import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/Login';
import SetupPage from './pages/Setup';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import InboundPage from './pages/Inbound';
import StocktakePage from './pages/Stocktake';
import ScrapPage from './pages/Scrap';
import NearExpiryPage from './pages/NearExpiry';
import PendingPage from './pages/Pending';
import { OfflineProvider } from './lib/OfflineContext';

export default function App() {
  return (
    <Routes>
      {/* 服务器配置页:公开路由,APK 首次启动或"重新配置"入口 */}
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <OfflineProvider>
              <Layout />
            </OfflineProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/inbound" replace />} />
        <Route path="inbound" element={<InboundPage />} />
        <Route path="stocktake" element={<StocktakePage />} />
        <Route path="scrap" element={<ScrapPage />} />
        <Route path="near-expiry" element={<NearExpiryPage />} />
        <Route path="pending" element={<PendingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
