import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Download, Maximize2, X } from 'lucide-react';
import { saveExportFile } from '../lib/export';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    fontFamily: 'var(--font-sans)',
  }
});

interface MermaidProps {
  chart: string;
}

export const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const renderChart = async () => {
      try {
        if (containerRef.current) {
          const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
          const { svg } = await mermaid.render(id, chart);
          setSvg(svg);
        }
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        setSvg('<div class="text-red-500 text-sm p-4 border border-red-200 bg-red-50 rounded">Failed to render diagram. Please check syntax.</div>');
      }
    };
    renderChart();
  }, [chart]);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  const canExport = Boolean(svg && !svg.includes('Failed to render'));

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
          dangerouslySetInnerHTML={{ __html: svg }}
        />
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
          </div>
          <button 
            onClick={toggleFullscreen}
            className="absolute top-6 right-6 p-2 bg-bg-panel rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={24} />
          </button>
          <div 
            className="w-full h-full flex items-center justify-center overflow-auto p-4 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </>
  );
};

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
