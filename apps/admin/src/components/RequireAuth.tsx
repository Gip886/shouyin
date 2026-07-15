import { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken } from '../lib/api';

export default function RequireAuth({ children }: PropsWithChildren) {
  const loc = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
