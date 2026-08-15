import { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, MousePointer2 } from 'lucide-react';
import { Mermaid } from '../../../components/Mermaid';
import { parseMermaidNodes, updateMermaidNodeLabel } from '../mermaidModel';

export function MermaidEditorWidget({
  source,
  locale,
  onSourceChange
}: {
  source: string;
  locale: 'zh' | 'en';
  onSourceChange: (source: string) => void;
}) {
  const nodes = useMemo(() => parseMermaidNodes(source), [source]);
  const [selectedNodeId, setSelectedNodeId] = useState(() => nodes[0]?.id ?? '');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;

  useEffect(() => {
    if (!selectedNode && selectedNodeId) setSelectedNodeId('');
    if (selectedNode && selectedNode.id !== selectedNodeId) setSelectedNodeId(selectedNode.id);
  }, [selectedNode, selectedNodeId]);

  const selectNode = (id: string, focusInput = false) => {
    setSelectedNodeId(id);
    setStatus('');
    if (focusInput) window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const changeLabel = (nextLabel: string) => {
    if (!selectedNode || nextLabel === selectedNode.label) return;
    try {
      onSourceChange(updateMermaidNodeLabel(source, selectedNode, nextLabel));
      setStatus(t('节点文字已同步到 Markdown', 'Node label synced to Markdown'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      className="inkstack-wysiwyg-mermaid-editor"
      data-inkstack-wysiwyg-mermaid-editor="true"
      data-inkstack-wysiwyg-interactive="true"
    >
      <Mermaid
        chart={source}
        editableNodes={nodes.map(({ id, label }) => ({ id, label }))}
        selectedNodeId={selectedNode?.id}
        onNodeSelect={(id) => selectNode(id, true)}
      />

      {nodes.length > 0 ? (
        <div className="rounded-md border border-border-subtle bg-bg-panel/55 p-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
            <MousePointer2 size={13} />
            <span>{t('单击图中节点，直接修改节点文字；连线和图形结构保持不变。', 'Click a node and edit its label directly; edges and graph structure stay unchanged.')}</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1" aria-label={t('可编辑图表节点', 'Editable diagram nodes')}>
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => selectNode(node.id, true)}
                aria-pressed={selectedNode?.id === node.id}
                className="rounded border border-border-subtle bg-bg-base px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-text-primary aria-pressed:border-accent aria-pressed:text-accent"
              >
                {node.id}
              </button>
            ))}
          </div>
          {selectedNode && (
            <label className="grid gap-1 text-[11px] text-text-secondary">
              <span className="flex items-center gap-1.5">
                <GitBranch size={13} />
                {t(`节点 ${selectedNode.id} 的内容`, `Node ${selectedNode.id} label`)}
              </span>
              <input
                ref={inputRef}
                value={selectedNode.label}
                onChange={(event) => changeLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                className="rounded border border-border-subtle bg-bg-base px-2.5 py-2 text-[13px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          )}
          <div role="status" className="mt-1.5 min-h-4 text-[11px] text-text-tertiary">{status}</div>
        </div>
      ) : (
        <div role="status" className="rounded-md border border-amber-300/70 bg-amber-50/70 p-3 text-[12px] text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/25 dark:text-amber-100">
          {t(
            '图表结构已保留，但当前语法中没有识别到可安全编辑的命名节点。可以继续使用“编辑源码”。',
            'The graph structure is preserved, but no safely editable named nodes were found. You can still use Edit source.'
          )}
        </div>
      )}
    </div>
  );
}
