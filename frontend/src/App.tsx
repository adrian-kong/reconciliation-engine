import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout/layout';
import { Dashboard } from '@/pages/dashboard';
import { Invoices } from '@/pages/invoices';
import { Payments } from '@/pages/payments';
import { ReconciliationPage } from '@/pages/reconciliation';
import { Exceptions } from '@/pages/exceptions';
import { Import } from '@/pages/import';
import { Settings } from '@/pages/settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/reconciliation" element={<ReconciliationPage />} />
              <Route path="/exceptions" element={<Exceptions />} />
              <Route path="/import" element={<Import />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

