import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3456',
  plugins: [organizationClient()],
});

// Export typed hooks and methods
export const {
  useSession,
  signIn,
  signOut,
  useActiveOrganization,
  useListOrganizations,
  organization,
} = authClient;
