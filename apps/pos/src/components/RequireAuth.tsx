import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { getToken } from '../lib/api';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const loc = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
