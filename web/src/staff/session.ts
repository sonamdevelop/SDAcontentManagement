import { createContext, useContext } from 'react';
import type { Profile, StaffApi } from './api';
export const Auth = createContext<{ api: StaffApi; profile: Profile; clear: () => void } | null>(
  null,
);
export function useAuth() {
  const value = useContext(Auth);
  if (!value) throw new Error('Staff session required');
  return value;
}
