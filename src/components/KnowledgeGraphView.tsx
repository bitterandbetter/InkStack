import cytoscape from 'cytoscape';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Maximize2, Minimize2, Network, RefreshCw, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useStore } from '../store';
import { getWorkspaceKnowledgeGraph, type WorkspaceKnowledgeDocumentNode, type WorkspaceKnowledgeGraphEdge } from '../lib/knowledge';
import { openTextPath } from '../lib/desktopActions';
import { cn } from '../lib/utils';

type KnowledgeGraphViewProps = {
  locale: 'zh' | 'en';
  onClose: () => void;
};

export function KnowledgeGraphView({ locale, onClose }: KnowledgeGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<WorkspaceKnowledgeDocumentNode | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: WorkspaceKnowledgeDocumentNode[]; edges: WorkspaceKnowledgeGraphEdge[] } | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(locale === 'zh' ? '加载超时，请稍后重试' : 'Loading timeout, please try again later')), 15000)
      );
      const data = await Promise.race([
        getWorkspaceKnowledgeGraph(),
        timeoutPromise
      ]);
      setGraphData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (!containerRef.current || !graphData || loading) return;

    const elements: cytoscape.ElementDefinition[] = [
      ...graphData.nodes.map((node) => ({
        data: {
          id: node.path,
          label: node.title || node.relativePath.split('/').pop() || node.relativePath,
          relativePath: node.relativePath,
          incoming: node.incomingCount,
          outgoing: node.outgoingCount,
          tags: node.tags,
        },
        classes: node.tags.length > 0 ? 'tagged' : '',
      })),
      ...graphData.edges.filter((e) => e.resolved && e.targetPath).map((edge) => ({
        data: {
          id: edge.id,
          source: edge.sourcePath,
          target: edge.targetPath!,
          kind: edge.kind,
        },
      })),
    ];

    if (elements.length === 0) {
      setError(locale === 'zh' ? '没有找到文档间的链接关系' : 'No link relationships found between documents');
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#6366f1',
            label: 'data(label)',
            'text-wrap': 'ellipsis',
            'text-max-width': '120px',
            'font-size': '11px',
            color: '#e2e8f0',
            'text-valign': 'bottom',
            'shape': 'round-rectangle',
            'border-width': 2,
            'border-color': '#4f46e5',
            'border-opacity': 0.6,
          },
        },
        {
          selector: 'node:active',
          style: {
            'background-color': '#818cf8',
            'border-color': '#a5b4fc',
          },
        },
        {
          selector: 'node.tagged',
          style: {
            'background-color': '#059669',
            'border-color': '#047857',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#d97706',
            'border-width': 3,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#d97706',
            'border-width': 3,
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.2,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            width: 2.5,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.15,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeRepulsion: 6000,
        idealEdgeLength: 150,
        gravity: 0.3,
        numIter: 2500,
      },
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeData = node.data();
      const graphNode = graphData.nodes.find((n) => n.path === nodeData.id);
      if (graphNode) {
        setSelectedNode(graphNode);
        highlightConnected(node, cy);
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        resetHighlight(cy);
      }
    });

    cyRef.current = cy;

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [graphData, loading, locale]);

  const highlightConnected = (node: cytoscape.NodeSingular, cy: cytoscape.Core) => {
    const connectedNodes = node.neighborhood('node').add(node);
    cy.elements().removeClass('highlighted').addClass('dimmed');
    connectedNodes.removeClass('dimmed').addClass('highlighted');
    connectedNodes.connectedEdges().removeClass('dimmed').addClass('highlighted');
  };

  const resetHighlight = (cy: cytoscape.Core) => {
    cy.elements().removeClass('highlighted').removeClass('dimmed');
  };

  const handleSearch = useCallback(() => {
    if (!cyRef.current || !searchQuery.trim()) {
      if (cyRef.current) resetHighlight(cyRef.current);
      return;
    }

    const query = searchQuery.toLowerCase();
    cyRef.current.elements().removeClass('highlighted').removeClass('dimmed');

    const matchingNodes = cyRef.current.nodes().filter((node) => {
      const label = (node.data('label') || '').toLowerCase();
      const path = (node.data('relativePath') || '').toLowerCase();
      return label.includes(query) || path.includes(query);
    });

    if (matchingNodes.length > 0) {
      cyRef.current.elements().addClass('dimmed');
      matchingNodes.removeClass('dimmed').addClass('highlighted');
      matchingNodes.connectedEdges().removeClass('dimmed').addClass('highlighted');
      matchingNodes.neighborhood('node').removeClass('dimmed').addClass('highlighted');
      cyRef.current.animate({ fit: { eles: matchingNodes, padding: 50 } } as any, { duration: 400 });
    }
  }, [searchQuery]);

  const handleZoomIn = () => cyRef.current?.zoom({ level: cyRef.current.zoom() * 1.3, renderedPosition: { x: (containerRef.current?.clientWidth ?? 0) / 2, y: (containerRef.current?.clientHeight ?? 0) / 2 } });
  const handleZoomOut = () => cyRef.current?.zoom({ level: cyRef.current.zoom() / 1.3, renderedPosition: { x: (containerRef.current?.clientWidth ?? 0) / 2, y: (containerRef.current?.clientHeight ?? 0) / 2 } });
  const handleFit = () => cyRef.current?.fit(undefined, 40);

  const handleOpenDocument = async (path: string) => {
    try {
      await openTextPath(path);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to open document', err);
      setError(locale === 'zh'
        ? `无法打开文档：${err instanceof Error ? err.message : String(err)}`
        : `Could not open document: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const rootPath = useStore((s) => s.rootPath);

  return (
    <div className={cn(
      "flex flex-col bg-bg-base border-l border-border-subtle",
      isFullscreen ? "fixed inset-0 z-[60]" : "flex-1 h-full"
    )}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-accent" />
          <span className="text-[13px] font-semibold text-text-primary">
            {locale === 'zh' ? '知识图谱' : 'Knowledge Graph'}
          </span>
          {graphData && (
            <span className="text-[11px] text-text-tertiary">
              {graphData.nodes.length} {locale === 'zh' ? '文档' : 'docs'} · {graphData.edges.length} {locale === 'zh' ? '链接' : 'links'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder={locale === 'zh' ? '搜索文档...' : 'Search docs...'}
              className="h-7 w-40 rounded border border-border-subtle bg-bg-panel pl-7 pr-2 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
            />
          </div>
          <button onClick={handleSearch} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '搜索' : 'Search'}>
            <Search size={14} />
          </button>
          <button onClick={() => void loadGraph()} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '刷新' : 'Refresh'}>
            <RefreshCw size={14} />
          </button>
          <button onClick={handleZoomIn} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleZoomOut} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <button onClick={handleFit} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '适应画布' : 'Fit'}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title={isFullscreen ? (locale === 'zh' ? '退出全屏' : 'Exit Fullscreen') : (locale === 'zh' ? '全屏' : 'Fullscreen')}>
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary" title={locale === 'zh' ? '关闭' : 'Close'}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div ref={containerRef} className="flex-1 bg-[#0f172a]" />

        {selectedNode && (
          <div className="w-64 border-l border-border-subtle bg-bg-panel p-3 overflow-y-auto shrink-0">
            <h3 className="mb-2 text-[13px] font-semibold text-text-primary truncate">
              {selectedNode.title || selectedNode.relativePath.split('/').pop()}
            </h3>
            <p className="mb-2 text-[11px] text-text-tertiary break-all">
              {selectedNode.relativePath}
            </p>
            <div className="mb-3 space-y-1 text-[12px]">
              <div className="flex justify-between">
                <span className="text-text-secondary">{locale === 'zh' ? '入链' : 'Incoming'}</span>
                <span className="text-text-primary">{selectedNode.incomingCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">{locale === 'zh' ? '出链' : 'Outgoing'}</span>
                <span className="text-text-primary">{selectedNode.outgoingCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">{locale === 'zh' ? '内容块' : 'Blocks'}</span>
                <span className="text-text-primary">{selectedNode.blockCount}</span>
              </div>
            </div>
            {selectedNode.tags.length > 0 && (
              <div className="mb-3">
                <span className="mb-1 block text-[11px] text-text-secondary">{locale === 'zh' ? '标签' : 'Tags'}</span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((tag) => (
                    <span key={tag} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => {
                const fullPath = rootPath ? `${rootPath}/${selectedNode.relativePath}` : selectedNode.path;
                void handleOpenDocument(fullPath);
              }}
              className="w-full rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90"
            >
              {locale === 'zh' ? '打开文档' : 'Open Document'}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base/80 z-10">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      )}

      {!loading && graphData && graphData.nodes.length === 0 && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base/80 z-10">
          <div className="text-center p-6 max-w-sm">
            <Network size={48} className="mx-auto mb-3 text-text-tertiary" />
            <p className="text-[13px] text-text-secondary mb-2">
              {locale === 'zh' ? '暂无文档关联' : 'No document links found'}
            </p>
            <p className="text-[11px] text-text-tertiary mb-4 leading-relaxed">
              {locale === 'zh' 
                ? '知识图谱基于文档间的 Wiki 链接生成。请在 Markdown 文档中使用 [[文档名]] 语法创建链接，然后刷新。'
                : 'The knowledge graph is generated from wiki links between documents. Use [[Document Name]] syntax in your Markdown files to create links, then refresh.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => void loadGraph()}
                className="rounded-md bg-accent px-3 py-1.5 text-[12px] text-white hover:bg-accent/90"
              >
                {locale === 'zh' ? '刷新' : 'Refresh'}
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                {locale === 'zh' ? '关闭' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base/80 z-10">
          <div className="text-center p-6 max-w-sm">
            <p className="text-[13px] text-text-secondary mb-2">{error}</p>
            <p className="text-[11px] text-text-tertiary mb-4 leading-relaxed">
              {error.includes('timeout') || error.includes('超时')
                ? (locale === 'zh' ? '请稍后再试' : 'Please try again later')
                : (locale === 'zh' ? '请检查应用状态后重试' : 'Please check the app status and try again')}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => void loadGraph()}
                className="rounded-md bg-accent px-3 py-1.5 text-[12px] text-white hover:bg-accent/90"
              >
                {locale === 'zh' ? '重试' : 'Retry'}
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                {locale === 'zh' ? '关闭' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
