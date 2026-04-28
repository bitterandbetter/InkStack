import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Mermaid } from '../../components/Mermaid';
import { cn } from '../../lib/utils';

const COLLAPSE_LINE_THRESHOLD = 28;
let highlightModulePromise: Promise<typeof import('highlight.js/lib/common')> | null = null;

function loadHighlight() {
  if (!highlightModulePromise) {
    highlightModulePromise = import('highlight.js/lib/common');
  }
  return highlightModulePromise;
}

export function PreviewCodeBlock({ inline, className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState('');
  const code = childrenToCodeText(children).replace(/\n$/, '');
  const isBlock = inline === false || Boolean(className) || code.includes('\n');
  const match = /language-([\w-]+)/.exec(className || '');
  const language = match ? match[1] : '';
  const meta = typeof props.node?.data?.meta === 'string'
    ? props.node.data.meta
    : typeof props['data-meta'] === 'string'
      ? props['data-meta']
      : '';
  const title = parseCodeTitle(meta);
  const lines = useMemo(() => code.split('\n'), [code]);
  const shouldCollapse = lines.length > COLLAPSE_LINE_THRESHOLD;
  const visibleLines = shouldCollapse && !expanded ? lines.slice(0, COLLAPSE_LINE_THRESHOLD) : lines;
  const visibleCode = visibleLines.join('\n');

  useEffect(() => {
    let cancelled = false;
    if (!isBlock || language === 'mermaid') {
      setHighlightedHtml('');
      return;
    }

    void loadHighlight()
      .then((hljs) => {
        if (cancelled) return;
        const normalizedLanguage = normalizeHighlightLanguage(language);
        if (normalizedLanguage && hljs.default.getLanguage(normalizedLanguage)) {
          setHighlightedHtml(hljs.default.highlight(visibleCode, { language: normalizedLanguage }).value);
          return;
        }
        setHighlightedHtml(escapeHtml(visibleCode));
      })
      .catch(() => {
        if (!cancelled) setHighlightedHtml(escapeHtml(visibleCode));
      });

    return () => {
      cancelled = true;
    };
  }, [isBlock, language, visibleCode]);

  if (isBlock && language === 'mermaid') {
    return <Mermaid chart={code} />;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return isBlock ? (
    <div className="inkstack-code-block relative group mt-4 mb-6" data-inkstack-preview="code-block">
      <div className="inkstack-code-toolbar flex items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 font-mono text-[11px]">
        <span className="min-w-0 flex-1 truncate">
          {title || language || 'text'}
          {title && language ? <span className="ml-2 text-text-tertiary">{language}</span> : null}
        </span>
        <span className="text-text-tertiary">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        </span>
        {shouldCollapse && (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="inkstack-code-copy flex items-center gap-1 transition-colors"
            title={expanded ? 'Collapse code' : 'Expand code'}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
        <button onClick={handleCopy} className="inkstack-code-copy transition-colors" title="Copy code">
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        </button>
      </div>
      <div className="inkstack-code-surface overflow-hidden rounded-b-lg border" data-inkstack-preview="code-surface">
        <div
          className={cn(
            'grid grid-cols-[3rem_minmax(0,1fr)] overflow-auto',
            shouldCollapse && !expanded && 'max-h-[34rem]'
          )}
        >
          <pre className="m-0 select-none border-r border-border-subtle bg-[var(--color-code-header-bg)] px-2 py-4 text-right font-mono text-[12px] leading-relaxed text-[var(--color-code-muted)]">
            {visibleLines.map((_, index) => (
              <span key={index} className="block">
                {index + 1}
              </span>
            ))}
          </pre>
          <pre
            className={cn(
              'm-0 min-w-0 overflow-visible p-4',
              shouldCollapse && !expanded && 'max-h-[34rem]'
            )}
          >
            <code
              className={cn('hljs', className)}
              {...props}
              dangerouslySetInnerHTML={{ __html: highlightedHtml || escapeHtml(visibleCode) }}
            />
          </pre>
        </div>
        {shouldCollapse && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full border-t border-border-subtle bg-bg-panel px-3 py-2 text-center text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {`Show ${lines.length - visibleLines.length} more lines`}
          </button>
        )}
      </div>
    </div>
  ) : (
    <code className="inkstack-inline-code rounded border px-1.5 py-0.5 font-mono text-[0.875em] before:content-hidden after:content-hidden" {...props}>
      {children}
    </code>
  );
}

function parseCodeTitle(meta: string) {
  const value = meta.trim();
  if (!value) return '';

  const titled = value.match(/(?:^|\s)title=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  if (titled) return (titled[1] || titled[2] || titled[3] || '').trim();

  const firstToken = value.split(/\s+/)[0] ?? '';
  if (/^[\w./@()[\]-]+\.[A-Za-z0-9]+$/.test(firstToken) || firstToken.includes('/')) {
    return firstToken;
  }

  return '';
}

function childrenToCodeText(children: ReactNode): string {
  if (children === null || children === undefined || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToCodeText).join('');
  if (typeof children === 'object' && 'props' in children) {
    const child = children as { props?: { children?: ReactNode } };
    return childrenToCodeText(child.props?.children);
  }
  return '';
}

function normalizeHighlightLanguage(language: string) {
  const normalized = language.trim().toLowerCase();
  const aliases: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    sh: 'bash',
    zsh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    md: 'markdown'
  };
  return aliases[normalized] ?? normalized;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
