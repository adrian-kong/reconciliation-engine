import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { FileText, CheckCircle2, XCircle, Clock, Loader2, TrendingUp, AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PDFThumbnail } from "@/components/pdf-thumbnail";
import { STEP_DEFINITIONS, type StepId } from "@/types";

export const Route = createFileRoute("/dashboard/history")({
  component: HistoryPage,
});

const API_BASE = "http://localhost:3456/api";

interface ProcessingJob {
  id: string;
  fileName: string;
  fileKey?: string;
  fileSize: number;
  status: string;
  progress: number;
  currentStep?: StepId;
  result?: {
    documentType: string;
    savedRecordId?: string;
    processingTimeMs: number;
    confidence?: number;
  };
  error?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

function HistoryPage() {
  const queryClient = useQueryClient();

  // Fetch all processing jobs
  const { data: jobs = [], isLoading } = useQuery<ProcessingJob[]>({
    queryKey: ['all-processing-jobs'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/remittances/jobs`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json();
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`${API_BASE}/remittances/jobs/${jobId}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Retry failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-processing-jobs'] });
    },
  });

  // Sort by date
  const sortedJobs = [...jobs].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const successfulJobs = jobs.filter(j => j.status === 'completed').length;
  const failedJobs = jobs.filter(j => j.status === 'failed').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Processing History
        </h1>
        <p className="text-muted-foreground text-sm">
          Complete audit trail of all document processing activities
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Total Processed"
          value={jobs.length}
          icon={FileText}
        />
        <SummaryCard
          label="Successful"
          value={successfulJobs}
          icon={CheckCircle2}
          iconColor="text-green-500"
          trend={jobs.length > 0 ? `${Math.round((successfulJobs / jobs.length) * 100)}%` : undefined}
        />
        <SummaryCard
          label="Failed"
          value={failedJobs}
          icon={AlertTriangle}
          iconColor="text-red-500"
        />
        <SummaryCard
          label="In Progress"
          value={jobs.filter(j => !['completed', 'failed'].includes(j.status)).length}
          icon={Clock}
          iconColor="text-amber-500"
        />
      </div>

      {/* Jobs Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          All Documents
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedJobs.length === 0 ? (
          <Card className="p-12 text-center">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No processing history yet</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {sortedJobs.map((job) => (
              <JobPreviewCard
                key={job.id}
                job={job}
                onRetry={() => retryMutation.mutate(job.id)}
                isRetrying={retryMutation.isPending && retryMutation.variables === job.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-muted-foreground",
  trend
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  iconColor?: string;
  trend?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
          {trend && (
            <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {trend} success rate
            </p>
          )}
        </div>
        <div className={cn("p-2 rounded-lg bg-muted", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function JobPreviewCard({
  job,
  onRetry,
  isRetrying
}: {
  job: ProcessingJob;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const statusConfig: Record<string, { color: string; bgColor: string; icon: React.ElementType; label: string }> = {
    queued: { color: 'text-muted-foreground', bgColor: 'bg-muted', icon: Clock, label: 'Queued' },
    uploading: { color: 'text-blue-500', bgColor: 'bg-blue-500/10', icon: Loader2, label: 'Uploading' },
    processing: { color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: Loader2, label: 'Processing' },
    extracting: { color: 'text-purple-500', bgColor: 'bg-purple-500/10', icon: Loader2, label: 'Extracting' },
    validating: { color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', icon: Loader2, label: 'Validating' },
    saving: { color: 'text-green-500', bgColor: 'bg-green-500/10', icon: Loader2, label: 'Saving' },
    completed: { color: 'text-green-500', bgColor: 'bg-green-500/10', icon: CheckCircle2, label: 'Completed' },
    failed: { color: 'text-red-500', bgColor: 'bg-red-500/10', icon: XCircle, label: 'Failed' },
  };

  const config = statusConfig[job.status] || statusConfig.queued;
  const Icon = config.icon;
  const isRunning = !['completed', 'failed'].includes(job.status);

  // Fetch file URL for PDF preview
  useEffect(() => {
    if (job.fileKey) {
      fetch(`${API_BASE}/remittances/jobs/${job.id}/file-url`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => data?.url && setFileUrl(data.url))
        .catch(() => {});
    }
  }, [job.id, job.fileKey]);

  const processingTime = job.result?.processingTimeMs
    ? `${(job.result.processingTimeMs / 1000).toFixed(1)}s`
    : job.completedAt && job.startedAt
      ? `${((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000).toFixed(1)}s`
      : null;

  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors">
      {/* PDF thumbnail */}
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        {fileUrl ? (
          <PDFThumbnail url={fileUrl} className="w-full h-full" width={200} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className={cn(
              "h-10 w-10",
              config.color,
              isRunning && job.status !== 'queued' && "animate-spin"
            )} />
          </div>
        )}
        {/* Status badge overlay */}
        <div className="absolute top-2 right-2">
          <Badge variant="outline" className={cn("text-[10px]", config.bgColor, config.color)}>
            {config.label}
          </Badge>
        </div>
      </div>

      <div className="p-3">
        <p className="text-sm font-medium truncate mb-1" title={job.fileName}>
          {job.fileName}
        </p>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
          <span>{formatFileSize(job.fileSize)}</span>
          {processingTime && (
            <>
              <span>•</span>
              <span>{processingTime}</span>
            </>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground mb-2">
          {formatDateTime(job.createdAt)}
        </p>

        {/* Steps progress bar */}
        <div className="flex items-center gap-0.5 mb-2">
          {STEP_DEFINITIONS.map((step, index) => {
            const currentStepIndex = job.currentStep
              ? STEP_DEFINITIONS.findIndex(s => s.id === job.currentStep)
              : -1;
            const stepStatus = job.status === "failed" && currentStepIndex === index
              ? "failed"
              : job.status === "completed" || index < currentStepIndex
                ? "completed"
                : index === currentStepIndex
                  ? "running"
                  : "pending";
            return (
              <div
                key={step.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  stepStatus === 'completed' && "bg-green-500",
                  stepStatus === 'running' && "bg-amber-500",
                  stepStatus === 'failed' && "bg-red-500",
                  stepStatus === 'pending' && "bg-muted"
                )}
                title={`${step.name}: ${stepStatus}`}
              />
            );
          })}
        </div>

        {job.result?.confidence && (
          <Badge variant="outline" className="text-[10px] mb-2">
            {Math.round(job.result.confidence * 100)}% confidence
          </Badge>
        )}

        {job.error && (
          <p className="text-[10px] text-red-500 truncate mb-2" title={job.error}>
            {job.error}
          </p>
        )}

        {job.status === 'failed' && job.fileKey && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3 mr-1" />
            )}
            Retry
          </Button>
        )}
      </div>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
