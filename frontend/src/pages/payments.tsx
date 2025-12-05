import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search, Plus, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getPayments } from '@/lib/api';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import type { Payment } from '@/types';

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  check: 'Check',
  credit_card: 'Credit Card',
  direct_debit: 'Direct Debit',
  cash: 'Cash',
  other: 'Other',
};

export function Payments() {
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: getPayments,
  });

  const filteredPayments = payments
    ?.filter((pay) => {
      if (statusFilter !== 'all' && pay.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          pay.paymentReference.toLowerCase().includes(query) ||
          pay.payerName.toLowerCase().includes(query) ||
          pay.description.toLowerCase().includes(query)
        );
      }
      return true;
    });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track payment records
          </p>
        </div>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/20"
          />
        </div>
        <div className="flex gap-1">
          {['all', 'pending', 'matched', 'unmatched'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-colors',
                statusFilter === status
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-4 text-xs font-medium text-muted-foreground">Reference</th>
              <th className="p-4 text-xs font-medium text-muted-foreground">Payer</th>
              <th className="p-4 text-xs font-medium text-muted-foreground text-right">Amount</th>
              <th className="p-4 text-xs font-medium text-muted-foreground">Date</th>
              <th className="p-4 text-xs font-medium text-muted-foreground">Method</th>
              <th className="p-4 text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-4 text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments?.map((payment) => (
              <tr 
                key={payment.id} 
                className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors"
              >
                <td className="p-4">
                  <span className="font-mono text-sm">{payment.paymentReference}</span>
                </td>
                <td className="p-4">
                  <div>
                    <p className="text-sm">{payment.payerName}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {payment.description}
                    </p>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <span className="font-mono text-sm">{formatCurrency(payment.amount)}</span>
                </td>
                <td className="p-4">
                  <p className="text-sm">{formatDate(payment.paymentDate)}</p>
                </td>
                <td className="p-4">
                  <p className="text-sm">{paymentMethodLabels[payment.paymentMethod]}</p>
                </td>
                <td className="p-4">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    getStatusColor(payment.status)
                  )}>
                    {payment.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => setSelectedPayment(payment)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPayments?.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No payments found</p>
          </div>
        )}
      </div>

      {/* Payment Detail Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">{selectedPayment?.paymentReference}</DialogTitle>
            <DialogDescription>{selectedPayment?.payerName}</DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="text-lg font-semibold font-mono">
                    {formatCurrency(selectedPayment.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-1",
                    getStatusColor(selectedPayment.status)
                  )}>
                    {selectedPayment.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm">{formatDate(selectedPayment.paymentDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="text-sm">{paymentMethodLabels[selectedPayment.paymentMethod]}</p>
                </div>
                {selectedPayment.bankReference && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Bank Reference</p>
                    <p className="font-mono text-sm">{selectedPayment.bankReference}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
