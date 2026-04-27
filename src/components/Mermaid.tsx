import React, { useEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minus, RotateCcw, X, ZoomIn } from 'lucide-react';
import { saveExportFile } from '../lib/export';

interface MermaidProps {
  chart: string;
}

let mermaidModulePromise: Promise<typeof import('mermaid').default> | null = null;

async function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((module) => {
      module.default.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'var(--font-sans)',
        }
      });
      return module.default;
    });
  }
  return mermaidModulePromise;
}

export const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [svg, setSvg] = useState<string>('');
  const [renderError, setRenderError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('');
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    const renderChart = async () => {
      try {
        if (containerRef.current) {
          const mermaid = await loadMermaid();
          if (cancelled) return;
          const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
          const { svg } = await mermaid.render(id, chart);
          if (cancelled) return;
          setSvg(svg);
          setRenderError('');
        }
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        setSvg('');
        setRenderError(formatMermaidError(error));
      }
    };
    renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
      if (event.key === '0') resetView();
      if (event.key === '+' || event.key === '=') zoomIn();
      if (event.key === '-') zoomOut();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, scale, offset.x, offset.y]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    resetView();
  };
  const canExport = Boolean(svg && !renderError);
  const zoomIn = () => setScale((value) => clampScale(value + 0.15));
  const zoomOut = () => setScale((value) => clampScale(value - 0.15));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragState.current = null;
  };

  const exportSvg = async () => {
    if (!canExport) return;
    await saveExportFile('diagram.svg', svg, 'svg', 'svg');
    setStatus('SVG exported');
    window.setTimeout(() => setStatus(''), 1800);
  };

  const exportPng = async () => {
    if (!canExport) return;
    try {
      const dataUrl = await renderSvgToPng(svg);
      await saveExportFile('diagram.png', dataUrl, 'png', 'png');
      setStatus('PNG exported');
      window.setTimeout(() => setStatus(''), 1800);
    } catch (error: any) {
      setStatus(error?.message ?? 'PNG export failed');
      window.setTimeout(() => setStatus(''), 2500);
    }
  };

  return (
    <>
      <div className="relative group my-8">
        <div 
          ref={containerRef} 
          className="flex justify-center items-center bg-bg-panel border border-border-subtle rounded-lg p-6 min-h-[100px] overflow-auto chart-container"
        >
          {renderError ? (
            <MermaidError message={renderError} chart={chart} />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          )}
        </div>
        {canExport && (
          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button 
              onClick={exportSvg}
              className="rounded border border-border-subtle bg-bg-base/80 p-1.5 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
              title="Export SVG"
            >
              <Download size={14} />
            </button>
            <button 
              onClick={exportPng}
              className="rounded border border-border-subtle bg-bg-base/80 px-1.5 py-1 text-[11px] text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
              title="Export PNG"
            >
              PNG
            </button>
            <button 
              onClick={toggleFullscreen}
              className="rounded border border-border-subtle bg-bg-base/80 p-1.5 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
              title="Zoom diagram"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        )}
        {status && (
          <div className="absolute bottom-2 right-2 rounded border border-border-subtle bg-bg-base/90 px-2 py-1 text-[11px] text-text-secondary shadow-sm">
            {status}
          </div>
        )}
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/95 backdrop-blur p-8">
          <div className="absolute left-6 top-6 flex items-center gap-2">
            <button
              onClick={exportSvg}
              className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              Export SVG
            </button>
            <button
              onClick={exportPng}
              className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              Export PNG
            </button>
            <button
              onClick={zoomOut}
              className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={zoomIn}
              className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={resetView}
              className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              <RotateCcw size={14} />
            </button>
            <span className="rounded-md border border-border-subtle bg-bg-panel px-3 py-2 font-mono text-[12px] text-text-tertiary">
              {Math.round(scale * 100)}%
            </span>
          </div>
          <button 
            onClick={toggleFullscreen}
            className="absolute top-6 right-6 p-2 bg-bg-panel rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={24} />
          </button>
          <div 
            className="h-full w-full select-none overflow-hidden rounded-lg border border-border-subtle bg-bg-panel"
            onWheel={(event) => {
              event.preventDefault();
              setScale((value) => clampScale(value + (event.deltaY < 0 ? 0.08 : -0.08)));
            }}
            onMouseDown={(event) => {
              dragState.current = {
                x: event.clientX,
                y: event.clientY,
                offsetX: offset.x,
                offsetY: offset.y
              };
            }}
            onMouseMove={(event) => {
              if (!dragState.current) return;
              setOffset({
                x: dragState.current.offsetX + event.clientX - dragState.current.x,
                y: dragState.current.offsetY + event.clientY - dragState.current.y
              });
            }}
            onMouseUp={() => {
              dragState.current = null;
            }}
            onMouseLeave={() => {
              dragState.current = null;
            }}
          >
            <div className="flex h-full w-full items-center justify-center">
              <div
                className="cursor-grab active:cursor-grabbing [&>svg]:h-auto [&>svg]:max-h-none [&>svg]:max-w-none [&>svg]:w-auto"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transformOrigin: 'center center'
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function MermaidError({ message, chart }: { message: string; chart: string }) {
  const firstLine = chart.split(/\r?\n/).find((line) => line.trim()) || '';
  return (
    <div className="w-full rounded-md border border-red-300 bg-red-50 p-4 text-left text-[13px] text-red-900 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200">
      <div className="font-semibold">Mermaid render failed</div>
      <div className="mt-1 whitespace-pre-wrap text-[12px] opacity-90">{message}</div>
      {firstLine && (
        <div className="mt-3 rounded border border-red-200 bg-white/70 px-2 py-1.5 font-mono text-[11px] text-red-800 dark:border-red-500/30 dark:bg-black/20 dark:text-red-100">
          First line: {firstLine}
        </div>
      )}
    </div>
  );
}

function clampScale(value: number) {
  return Math.min(4, Math.max(0.25, Number(value.toFixed(2))));
}

function formatMermaidError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown Mermaid syntax error';
  }
}

function renderSvgToPng(svg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      const width = Math.max(image.naturalWidth || image.width || 1200, 1);
      const height = Math.max(image.naturalHeight || image.height || 800, 1);
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas is unavailable'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG for PNG export'));
    };

    image.src = url;
  });
}
