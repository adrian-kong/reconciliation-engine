import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { cn } from '@/lib/utils';
import { FileText, Loader2 } from 'lucide-react';

// Set up the worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PDFThumbnailProps {
  url: string | null;
  className?: string;
  width?: number;
}

export function PDFThumbnail({ url, className, width = 150 }: PDFThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !canvasRef.current) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        const page = await pdf.getPage(1);

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate scale to fit the desired width
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        // Set canvas dimensions
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // Render the page
        const renderContext = {
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport: scaledViewport,
        };
        await page.render(renderContext as Parameters<typeof page.render>[0]).promise;

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setError(true);
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
    };
  }, [url, width]);

  if (!url || error) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)}>
        <FileText className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden flex items-center justify-center", className)}>
      {loading && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cn(
          "max-w-full max-h-full object-contain",
          loading && "opacity-0"
        )}
      />
    </div>
  );
}
