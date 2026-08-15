import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Maximize2, Minus, RotateCcw, X, ZoomIn } from 'lucide-react';
import { saveExportFile } from '../lib/export';
import { getErrorMessage } from '../lib/utils';

interface MermaidProps {
  chart: string;
  editableNodes?: ReadonlyArray<{ id: string; label: string }>;
  selectedNodeId?: string;
  onNodeSelect?: (id: string) => void;
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

export const Mermaid: React.FC<MermaidProps> = ({
  chart,
  editableNodes = [],
  selectedNodeId,
  onNodeSelect
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [svg, setSvg] = useState<string>('');
  const [renderError, setRenderError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('');
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const fullscreenSvg = useMemo(() => buildFullscreenSvgMarkup(svg), [svg]);

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
    const container = containerRef.current;
    if (!container || !svg || !onNodeSelect || editableNodes.length === 0) return;

    const candidates = Array.from(container.querySelectorAll<SVGGraphicsElement>('g.node, g[id*="flowchart-"]'));
    const claimed = new Set<SVGGraphicsElement>();
    const cleanups: Array<() => void> = [];

    for (const node of editableNodes) {
      const element = findEditableMermaidNode(candidates, claimed, node);
      if (!element) continue;
      claimed.add(element);
      const previousTabIndex = element.getAttribute('tabindex');
      const previousRole = element.getAttribute('role');
      const previousLabel = element.getAttribute('aria-label');
      const activate = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        onNodeSelect(node.id);
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        activate(event);
      };

      element.classList.add('inkstack-mermaid-editable-node');
      element.classList.toggle('inkstack-mermaid-selected-node', node.id === selectedNodeId);
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `Edit Mermaid node ${node.id}: ${node.label}`);
      element.addEventListener('click', activate);
      element.addEventListener('keydown', keydown);

      cleanups.push(() => {
        element.classList.remove('inkstack-mermaid-editable-node', 'inkstack-mermaid-selected-node');
        restoreAttribute(element, 'tabindex', previousTabIndex);
        restoreAttribute(element, 'role', previousRole);
        restoreAttribute(element, 'aria-label', previousLabel);
        element.removeEventListener('click', activate);
        element.removeEventListener('keydown', keydown);
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [editableNodes, onNodeSelect, selectedNodeId, svg]);

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
    } catch (error: unknown) {
      setStatus(getErrorMessage(error) || 'PNG export failed');
      window.setTimeout(() => setStatus(''), 2500);
    }
  };

  return (
    <>
      <div className="relative group my-8" data-inkstack-preview="mermaid">
        <div 
          ref={containerRef} 
          className="flex justify-center items-center bg-bg-panel border border-border-subtle rounded-lg p-6 min-h-[100px] overflow-auto chart-container"
          data-inkstack-mermaid-editable={editableNodes.length > 0 ? 'true' : undefined}
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
          <div className="absolute left-6 top-6 z-20 flex items-center gap-2">
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
            className="absolute top-6 right-6 z-20 rounded-full bg-bg-panel p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={24} />
          </button>
          <div 
            className="relative z-0 h-full w-full select-none overflow-hidden rounded-lg border border-border-subtle bg-bg-panel"
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
                dangerouslySetInnerHTML={{ __html: fullscreenSvg }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

function findEditableMermaidNode(
  candidates: SVGGraphicsElement[],
  claimed: Set<SVGGraphicsElement>,
  node: { id: string; label: string }
) {
  const byId = candidates.find((candidate) => {
    if (claimed.has(candidate)) return false;
    const dataId = candidate.getAttribute('data-id') ?? candidate.getAttribute('data-node-id');
    const domId = candidate.id;
    return dataId === node.id
      || domId === node.id
      || domId.startsWith(`flowchart-${node.id}-`)
      || domId.includes(`-${node.id}-`);
  });
  if (byId) return byId;

  const normalizedLabel = normalizeNodeText(node.label);
  return candidates.find((candidate) => (
    !claimed.has(candidate)
    && normalizeNodeText(candidate.textContent ?? '') === normalizedLabel
  ));
}

function normalizeNodeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function restoreAttribute(element: Element, name: string, value: string | null) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

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

function buildFullscreenSvgMarkup(svg: string) {
  if (!svg) return svg;

  try {
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const svgElement = parsed.querySelector('svg');
    if (!svgElement) return svg;

    const viewBox = parseViewBox(svgElement.getAttribute('viewBox'));
    const width = parseSvgLength(svgElement.getAttribute('width'))
      ?? parseCssPixelValue(svgElement.style.maxWidth)
      ?? viewBox?.width
      ?? 1200;
    const height = parseSvgLength(svgElement.getAttribute('height'))
      ?? viewBox?.height
      ?? 800;

    svgElement.setAttribute('width', `${Math.max(width, 1)}`);
    svgElement.setAttribute('height', `${Math.max(height, 1)}`);
    svgElement.style.width = `${Math.max(width, 1)}px`;
    svgElement.style.height = `${Math.max(height, 1)}px`;
    svgElement.style.maxWidth = 'none';
    svgElement.style.maxHeight = 'none';
    svgElement.style.display = 'block';

    return new XMLSerializer().serializeToString(svgElement);
  } catch {
    return svg;
  }
}

function parseSvgLength(value: string | null) {
  if (!value || value.trim().endsWith('%')) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseViewBox(value: string | null) {
  if (!value) return null;
  const parts = value.split(/[\s,]+/).map(Number);
  if (parts.length !== 4) return null;
  const [, , width, height] = parts;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function parseCssPixelValue(value: string | null) {
  if (!value) return null;
  const matched = value.match(/([\d.]+)px/i);
  if (!matched) return null;
  const parsed = Number.parseFloat(matched[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
