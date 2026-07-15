import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/Login';
import Layout from './components/Layout';
import DashboardPage from './pages/Dashboard';
import CategoriesPage from './pages/Categories';
import ProductsPage from './pages/Products';
import BatchesPage from './pages/Batches';
import NotificationsPage from './pages/Notifications';
import ReportsPage from './pages/Reports';
import StoreSettingsPage from './pages/StoreSettings';
import MobileSetupPage from './pages/MobileSetup';
import RequireAuth from './components/RequireAuth';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<StoreSettingsPage />} />
        <Route path="mobile-setup" element={<MobileSetupPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
