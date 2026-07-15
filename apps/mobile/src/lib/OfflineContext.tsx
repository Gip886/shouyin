import { createContext, ReactNode, useContext } from 'react';
import { useOfflineBundle } from './offlineHooks';

type OfflineCtx = ReturnType<typeof useOfflineBundle>;
const Ctx = createContext<OfflineCtx | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const value = useOfflineBundle();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOffline() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOffline must be inside <OfflineProvider>');
  return c;
}
