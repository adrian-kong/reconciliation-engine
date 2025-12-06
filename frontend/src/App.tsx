import { useMemo } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

function InnerApp() {
  const auth = useAuth();

  const routerContext = useMemo(
    () => ({
      queryClient,
      auth: {
        isAuthenticated: auth.isAuthenticated,
        hasOrganization: auth.hasOrganization,
        isLoading: auth.isLoading,
      },
    }),
    [auth.isAuthenticated, auth.hasOrganization, auth.isLoading]
  );

  return <RouterProvider router={router} context={routerContext} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
