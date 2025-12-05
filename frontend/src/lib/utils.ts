import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Invoice statuses
    pending: 'bg-yellow-500/10 text-yellow-500',
    matched: 'bg-emerald-500/10 text-emerald-500',
    partially_matched: 'bg-blue-500/10 text-blue-500',
    disputed: 'bg-red-500/10 text-red-500',
    written_off: 'bg-neutral-500/10 text-neutral-500',
    // Payment statuses
    unmatched: 'bg-orange-500/10 text-orange-500',
    refunded: 'bg-purple-500/10 text-purple-500',
    // Reconciliation statuses
    pending_review: 'bg-yellow-500/10 text-yellow-500',
    approved: 'bg-emerald-500/10 text-emerald-500',
    rejected: 'bg-red-500/10 text-red-500',
    resolved: 'bg-emerald-500/10 text-emerald-500',
    // Exception statuses
    open: 'bg-red-500/10 text-red-500',
    in_review: 'bg-yellow-500/10 text-yellow-500',
    escalated: 'bg-purple-500/10 text-purple-500',
  }
  return colors[status] || 'bg-neutral-500/10 text-neutral-500'
}

export function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: 'bg-blue-500/10 text-blue-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    high: 'bg-orange-500/10 text-orange-500',
    critical: 'bg-red-500/10 text-red-500',
  }
  return colors[severity] || 'bg-neutral-500/10 text-neutral-500'
}
