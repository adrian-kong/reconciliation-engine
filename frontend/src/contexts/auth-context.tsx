import { createContext, useContext, ReactNode } from 'react';
import { useSession, useActiveOrganization } from '@/lib/auth-client';

interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
}

interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  activeOrganizationId?: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  createdAt: Date;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasOrganization: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: sessionData, isPending: sessionLoading } = useSession();
  const { data: organizationData, isPending: orgLoading } = useActiveOrganization();

  const value: AuthContextValue = {
    user: sessionData?.user ?? null,
    session: sessionData?.session ?? null,
    organization: organizationData ?? null,
    isLoading: sessionLoading || orgLoading,
    isAuthenticated: !!sessionData?.user,
    hasOrganization: !!organizationData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
