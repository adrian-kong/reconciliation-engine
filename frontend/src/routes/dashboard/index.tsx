import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Mail,
  TrendingUp,
  DollarSign,
  ClipboardList,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PDFThumbnail } from "@/components/pdf-thumbnail";
import { STEP_DEFINITIONS, type StepId } from "@/types";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

const API_BASE = "http://localhost:3456/api";

interface ProcessingJob {
  id: string;
  fileName: string;
  fileSize: number;
  status:
    | "queued"
    | "uploading"
    | "processing"
    | "extracting"
    | "validating"
    | "saving"
    | "completed"
    | "failed";
  progress: number;
  currentStep?: StepId;
  result?: {
    documentType: string;
    savedRecordId?: string;
    processingTimeMs: number;
    confidence?: number;
  };
  error?: string;
  createdAt: string;
}

interface Remittance {
  id: string;
  remittanceNumber: string;
  fleetCompanyName: string;
  remittanceDate: string;
  totalAmount: number;
  currency: string;
  sourceFileKey?: string;
  jobs: {
    id: string;
    workOrderNumber: string;
    vehicleInfo?: string;
    serviceDate: string;
    description: string;
    laborAmount?: number;
    partsAmount?: number;
    totalAmount: number;
    status: string;
  }[];
  createdAt: string;
}

interface Stats {
  totalRemittances: number;
  totalProcessingJobs: number;
  completedJobs: number;
  failedJobs: number;
  pendingJobs: number;
  totalAmount: number;
  totalWorkOrders: number;
}

// Optimistic upload entry for immediate UI feedback
interface OptimisticUpload {
  id: string;
  fileName: string;
  fileSize: number;
  status:
    | "pending"
    | "uploading"
    | "processing"
    | "extracting"
    | "validating"
    | "saving"
    | "completed"
    | "failed";
  progress: number;
  createdAt: string;
  serverJobId?: string;
  error?: string;
}

// Simple ID generator for optimistic uploads
let optimisticIdCounter = 0;
const generateOptimisticId = () =>
  `optimistic-${Date.now()}-${++optimisticIdCounter}`;

function DashboardPage() {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Optimistic uploads state - persists during page session, clears on route change
  const [optimisticUploads, setOptimisticUploads] = useState<
    OptimisticUpload[]
  >([]);

  // Fetch processing jobs
  const { data: jobs = [] } = useQuery<ProcessingJob[]>({
    queryKey: ["processing-jobs"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/remittances/jobs`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });

  // Fetch recent remittances
  const { data: remittancesData, isLoading: remittancesLoading } = useQuery<{
    remittances: Remittance[];
    total: number;
  }>({
    queryKey: ["remittances"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/remittances?limit=10`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch remittances");
      return res.json();
    },
  });

  // Fetch stats
  const { data: stats } = useQuery<Stats>({
    queryKey: ["remittance-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/remittances/stats/summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  // Retry mutation for failed jobs
  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`${API_BASE}/remittances/jobs/${jobId}/retry`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Retry failed");
      return res.json();
    },
    onMutate: (jobId) => {
      // Update the optimistic upload to show retrying
      setOptimisticUploads((prev) =>
        prev.map((u) =>
          u.serverJobId === jobId
            ? {
                ...u,
                status: "processing" as const,
                progress: 5,
                error: undefined,
              }
            : u
        )
      );
    },
    onError: (error, jobId) => {
      setOptimisticUploads((prev) =>
        prev.map((u) =>
          u.serverJobId === jobId
            ? {
                ...u,
                status: "failed" as const,
                error: error instanceof Error ? error.message : "Retry failed",
              }
            : u
        )
      );
    },
  });

  // Handler for retry button
  const handleRetry = useCallback(
    (upload: OptimisticUpload) => {
      if (upload.serverJobId) {
        retryMutation.mutate(upload.serverJobId);
      }
    },
    [retryMutation]
  );

  // Upload mutation - now receives optimistic IDs along with files
  const uploadMutation = useMutation({
    mutationFn: async ({
      files,
      optimisticIds,
    }: {
      files: File[];
      optimisticIds: string[];
    }) => {
      const formData = new FormData();
      if (files.length === 1) {
        formData.append("file", files[0]);
        const res = await fetch(`${API_BASE}/remittances/upload`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        return { data, optimisticIds, isBulk: false };
      } else {
        files.forEach((file) => formData.append("files", file));
        const res = await fetch(`${API_BASE}/remittances/upload/bulk`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        return { data, optimisticIds, isBulk: true };
      }
    },
    onMutate: async ({ optimisticIds }) => {
      // Update optimistic uploads to 'uploading' status
      setOptimisticUploads((prev) =>
        prev.map((u) =>
          optimisticIds.includes(u.id)
            ? { ...u, status: "uploading" as const, progress: 5 }
            : u
        )
      );
    },
    onSuccess: ({ data, optimisticIds, isBulk }) => {
      // Link server job IDs to optimistic uploads
      if (isBulk && data.jobs) {
        // Bulk upload returns array of jobs
        setOptimisticUploads((prev) =>
          prev.map((u) => {
            const optimisticIndex = optimisticIds.indexOf(u.id);
            if (optimisticIndex !== -1 && data.jobs[optimisticIndex]) {
              return {
                ...u,
                serverJobId: data.jobs[optimisticIndex].id,
                status: "processing" as const,
                progress: 10,
              };
            }
            return u;
          })
        );
      } else if (data.jobId) {
        // Single upload returns single job
        setOptimisticUploads((prev) =>
          prev.map((u) =>
            optimisticIds.includes(u.id)
              ? {
                  ...u,
                  serverJobId: data.jobId,
                  status: "processing" as const,
                  progress: 10,
                }
              : u
          )
        );
      }
      // Don't aggressively invalidate - let SSE handle updates
    },
    onError: (error, { optimisticIds }) => {
      // Mark optimistic uploads as failed
      setOptimisticUploads((prev) =>
        prev.map((u) =>
          optimisticIds.includes(u.id)
            ? {
                ...u,
                status: "failed" as const,
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : u
        )
      );
    },
  });

  // SSE for real-time updates - now updates optimistic state directly
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/remittances/events`, {
      withCredentials: true,
    });
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", () => {
      setSseConnected(true);
    });

    eventSource.addEventListener("job_created", (e) => {
      try {
        const event = JSON.parse(e.data);
        // Update optimistic upload if it matches (by fileName since serverJobId may not be linked yet)
        setOptimisticUploads((prev) =>
          prev.map((u) => {
            if (
              u.serverJobId === event.jobId ||
              (event.data?.fileName &&
                u.fileName === event.data.fileName &&
                !u.serverJobId)
            ) {
              return {
                ...u,
                serverJobId: event.jobId,
                status: "processing" as const,
                progress: 15,
              };
            }
            return u;
          })
        );
      } catch {
        // Fallback to query invalidation
        queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      }
    });

    eventSource.addEventListener("job_updated", (e) => {
      try {
        const event = JSON.parse(e.data);
        // Update optimistic upload with progress and status
        setOptimisticUploads((prev) =>
          prev.map((u) => {
            if (u.serverJobId === event.jobId) {
              return {
                ...u,
                status: event.data.status || u.status,
                progress: event.data.progress ?? u.progress,
              };
            }
            return u;
          })
        );
        // Also update processing jobs for the detailed view
        queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      } catch {
        queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      }
    });

    eventSource.addEventListener("job_completed", (e) => {
      try {
        const event = JSON.parse(e.data);
        // Mark optimistic upload as completed
        setOptimisticUploads((prev) =>
          prev.map((u) => {
            if (u.serverJobId === event.jobId) {
              return { ...u, status: "completed" as const, progress: 100 };
            }
            return u;
          })
        );
      } catch {
        // ignore parse errors
      }
      // Refresh remittances to get the newly created remittance data
      queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["remittances"] });
      queryClient.invalidateQueries({ queryKey: ["remittance-stats"] });
    });

    eventSource.addEventListener("job_failed", (e) => {
      try {
        const event = JSON.parse(e.data);
        // Mark optimistic upload as failed
        setOptimisticUploads((prev) =>
          prev.map((u) => {
            if (u.serverJobId === event.jobId) {
              return {
                ...u,
                status: "failed" as const,
                error: event.data.error,
              };
            }
            return u;
          })
        );
      } catch {
        // ignore parse errors
      }
      queryClient.invalidateQueries({ queryKey: ["processing-jobs"] });
    });

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [queryClient]);

  // Create optimistic uploads from files and start upload
  const startOptimisticUpload = useCallback(
    (files: File[]) => {
      const now = new Date().toISOString();
      const optimisticIds: string[] = [];

      // Create optimistic entries for each file
      const newOptimisticUploads: OptimisticUpload[] = files.map((file) => {
        const id = generateOptimisticId();
        optimisticIds.push(id);
        return {
          id,
          fileName: file.name,
          fileSize: file.size,
          status: "pending" as const,
          progress: 0,
          createdAt: now,
        };
      });

      // Add to optimistic uploads state immediately
      setOptimisticUploads((prev) => [...newOptimisticUploads, ...prev]);

      // Start the actual upload
      uploadMutation.mutate({ files, optimisticIds });
    },
    [uploadMutation]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf"
      );
      if (files.length > 0) {
        startOptimisticUpload(files);
      }
    },
    [startOptimisticUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter(
        (f) => f.type === "application/pdf"
      );
      if (files.length > 0) {
        startOptimisticUpload(files);
      }
      e.target.value = "";
    },
    [startOptimisticUpload]
  );

  const activeJobs = jobs.filter(
    (j) => !["completed", "failed"].includes(j.status)
  );

  return (
    <div className="p-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Remittances"
          value={stats?.totalRemittances || 0}
          icon={FileText}
          trend="+12%"
        />
        <StatsCard
          title="Work Orders"
          value={stats?.totalWorkOrders || 0}
          icon={ClipboardList}
          trend="+8%"
        />
        <StatsCard
          title="Total Amount"
          value={`$${(stats?.totalAmount || 0).toLocaleString()}`}
          icon={DollarSign}
          trend="+15%"
        />
        <StatsCard
          title="Processed Today"
          value={stats?.completedJobs || 0}
          icon={TrendingUp}
          trend="+5%"
        />
      </div>

      {/* Upload Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Upload Documents</h2>
            <p className="text-sm text-muted-foreground">
              Drag & drop remittance PDFs for AI-powered extraction
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span>Or email to</span>
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono">
              remittance@yourdomain.com
            </code>
          </div>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-xl border-2 border-dashed transition-all duration-300",
            "bg-card",
            isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-muted-foreground/50",
            (!sseConnected || uploadMutation.isPending) && "opacity-50 pointer-events-none"
          )}
        >
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={!sseConnected || uploadMutation.isPending}
          />
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div
              className={cn(
                "mb-4 rounded-xl p-3 transition-colors",
                isDragging ? "bg-primary/20" : "bg-muted"
              )}
            >
              <Upload
                className={cn(
                  "h-6 w-6 transition-colors",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>
            <p className="text-sm font-medium mb-1">
              {!sseConnected
                ? "Connecting..."
                : isDragging
                  ? "Drop PDFs here"
                  : "Drag & drop remittance PDFs"}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              PDF files up to 10MB each
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={!sseConnected || uploadMutation.isPending}
            >
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Select Files
            </Button>
          </div>
        </div>
      </div>

      {/* Active Processing Jobs */}
      {activeJobs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Processing Now
          </h2>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <ProcessingJobCard
                key={job.id}
                job={job}
                expanded={expandedJobId === job.id}
                onToggle={() =>
                  setExpandedJobId(expandedJobId === job.id ? null : job.id)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Remittances - grid layout with optimistic uploads */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Recent Remittances
        </h2>

        {(() => {
          const pendingUploads = optimisticUploads.filter(
            (u) => u.status !== "completed"
          );
          const serverRemittances = remittancesData?.remittances || [];
          const hasContent =
            pendingUploads.length > 0 || serverRemittances.length > 0;

          if (remittancesLoading && optimisticUploads.length === 0) {
            return (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            );
          }

          if (!hasContent) {
            return (
              <Card className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">
                  No remittances yet. Upload a PDF to get started.
                </p>
              </Card>
            );
          }

          return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Show optimistic uploads first (in-progress ones) */}
              {pendingUploads.map((upload) => (
                <OptimisticUploadPreviewCard
                  key={upload.id}
                  upload={upload}
                  onRetry={() => handleRetry(upload)}
                />
              ))}
              {/* Then show server remittances */}
              {serverRemittances.map((remittance) => (
                <RemittancePreviewCard
                  key={remittance.id}
                  remittance={remittance}
                />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
          {trend && (
            <p className="text-xs text-green-500 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {trend} from last month
            </p>
          )}
        </div>
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

function ProcessingJobCard({
  job,
  expanded,
  onToggle,
}: {
  job: ProcessingJob;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusConfig = {
    queued: { color: "bg-muted", icon: Clock, label: "Queued" },
    uploading: {
      color: "bg-blue-500/10 text-blue-500",
      icon: Loader2,
      label: "Uploading",
    },
    processing: {
      color: "bg-amber-500/10 text-amber-500",
      icon: Loader2,
      label: "Processing",
    },
    extracting: {
      color: "bg-purple-500/10 text-purple-500",
      icon: Loader2,
      label: "Extracting",
    },
    validating: {
      color: "bg-cyan-500/10 text-cyan-500",
      icon: Loader2,
      label: "Validating",
    },
    saving: {
      color: "bg-green-500/10 text-green-500",
      icon: Loader2,
      label: "Saving",
    },
    completed: {
      color: "bg-green-500/10 text-green-500",
      icon: CheckCircle2,
      label: "Completed",
    },
    failed: {
      color: "bg-red-500/10 text-red-500",
      icon: XCircle,
      label: "Failed",
    },
  };

  const config = statusConfig[job.status];
  const Icon = config.icon;
  const isRunning = !["completed", "failed"].includes(job.status);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className={cn("p-2 rounded-lg", config.color)}>
          <Icon className={cn("h-4 w-4", isRunning && "animate-spin")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{job.fileName}</span>
            <Badge variant="outline" className="text-xs">
              {config.label}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatFileSize(job.fileSize)} • Started{" "}
            {formatRelativeTime(job.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isRunning && (
            <div className="w-32">
              <Progress value={job.progress} className="h-1.5" />
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/20">
          <div className="space-y-2">
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
                <div key={step.id} className="flex items-center gap-3 text-xs">
                  <StepIcon status={stepStatus} />
                  <span
                    className={cn(
                      stepStatus === "running" && "text-foreground font-medium",
                      stepStatus === "completed" && "text-muted-foreground",
                      stepStatus === "pending" && "text-muted-foreground/50",
                      stepStatus === "failed" && "text-red-500"
                    )}
                  >
                    {step.name}
                  </span>
                </div>
              );
            })}
          </div>
          {job.error && (
            <div className="mt-3 p-2 rounded bg-red-500/10 text-red-500 text-xs">
              {job.error}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StepIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
  if (status === "failed")
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return (
    <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
  );
}

// Compact card for optimistic uploads in grid layout with PDF preview placeholder
function OptimisticUploadPreviewCard({
  upload,
  onRetry,
}: {
  upload: OptimisticUpload;
  onRetry?: () => void;
}) {
  const statusConfig: Record<
    OptimisticUpload["status"],
    { color: string; icon: React.ElementType; label: string }
  > = {
    pending: { color: "text-muted-foreground", icon: Clock, label: "Pending" },
    uploading: { color: "text-blue-500", icon: Upload, label: "Uploading" },
    processing: { color: "text-amber-500", icon: Loader2, label: "Processing" },
    extracting: {
      color: "text-purple-500",
      icon: Sparkles,
      label: "Extracting",
    },
    validating: { color: "text-cyan-500", icon: Loader2, label: "Validating" },
    saving: { color: "text-green-500", icon: Loader2, label: "Saving" },
    completed: {
      color: "text-green-500",
      icon: CheckCircle2,
      label: "Completed",
    },
    failed: { color: "text-red-500", icon: XCircle, label: "Failed" },
  };

  const config = statusConfig[upload.status];
  const Icon = config.icon;
  const isRunning = !["completed", "failed"].includes(upload.status);

  return (
    <Card className="overflow-hidden">
      {/* PDF preview placeholder */}
      <div className="aspect-[4/3] bg-muted flex items-center justify-center">
        <Icon
          className={cn(
            "h-10 w-10",
            config.color,
            isRunning && upload.status !== "pending" && "animate-spin"
          )}
        />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[10px]">
            {config.label}
          </Badge>
        </div>
        <p className="text-sm font-medium truncate mb-1">{upload.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(upload.fileSize)}
        </p>
        {isRunning && <Progress value={upload.progress} className="h-1 mt-2" />}
        {upload.status === "failed" && onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-2 h-7 text-xs"
            onClick={onRetry}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Retry
          </Button>
        )}
        {upload.error && (
          <p className="text-[10px] text-red-500 mt-1 truncate">
            {upload.error}
          </p>
        )}
      </div>
    </Card>
  );
}

// Compact preview card for remittances in grid layout with PDF thumbnail
function RemittancePreviewCard({ remittance }: { remittance: Remittance }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (remittance.sourceFileKey) {
      fetch(`${API_BASE}/remittances/${remittance.id}/file-url`, {
        credentials: "include",
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.url && setFileUrl(data.url))
        .catch(() => {});
    }
  }, [remittance.id, remittance.sourceFileKey]);

  return (
    <Card className="overflow-hidden hover:bg-muted/30 transition-colors cursor-pointer">
      {/* PDF thumbnail */}
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        <PDFThumbnail url={fileUrl} className="w-full h-full" width={200} />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span className="text-[10px] text-muted-foreground truncate">
            {remittance.remittanceNumber}
          </span>
        </div>
        <p className="text-sm font-semibold">
          ${remittance.totalAmount.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {remittance.fleetCompanyName}
        </p>
        <div className="flex items-center justify-between mt-2">
          <Badge variant="outline" className="text-[10px]">
            {remittance.jobs.length} jobs
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatDate(remittance.remittanceDate)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
