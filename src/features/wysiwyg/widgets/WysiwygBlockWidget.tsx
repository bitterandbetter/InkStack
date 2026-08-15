import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Code2, Copy, RotateCcw } from 'lucide-react';
import katex from 'katex';
import Markdown from 'react-markdown';
import { PreviewCodeBlock } from '../../preview/PreviewCodeBlock';
import { PreviewImage } from '../../preview/PreviewImage';
import { PreviewTable } from '../../preview/PreviewTable';
import { rehypePlugins, remarkPlugins } from '../../preview/markdownPipeline';
import { TableEditorWidget } from './TableEditorWidget';
import { pickAndImportMarkdownAsset } from '../../../lib/fs';

export function LazyWidgetContent({ children, label }: { children?: ReactNode; label?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible || !hostRef.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '900px 0px' });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={hostRef} className={!visible ? 'min-h-16 animate-pulse rounded bg-bg-panel/50' : ''} aria-label={!visible ? label : undefined}>
      {visible ? children : null}
    </div>
  );
}

export function WysiwygBlockFrame({
  label,
  source,
  locale,
  onEditSource,
  children,
  onRetry
}: {
  label: string;
  source: string;
  locale: 'zh' | 'en';
  onEditSource: () => void;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="inkstack-wysiwyg-widget group relative my-3 rounded-lg border border-border-subtle bg-bg-base"
      data-inkstack-wysiwyg-widget="true"
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onEditSource();
      }}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-panel/70 px-3 py-1.5 text-[11px] text-text-tertiary">
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {onRetry && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRetry();
            }}
            className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-bg-hover hover:text-text-primary"
          >
            <RotateCcw size={12} />
            {locale === 'zh' ? '重试' : 'Retry'}
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void navigator.clipboard.writeText(source).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-bg-hover hover:text-text-primary"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {locale === 'zh' ? '复制源码' : 'Copy source'}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEditSource();
          }}
          className="flex items-center gap-1 rounded bg-accent px-2 py-1 font-medium text-white hover:bg-accent/90"
        >
          <Code2 size={12} />
          {locale === 'zh' ? '编辑源码' : 'Edit source'}
        </button>
      </div>
      <div className="min-w-0 px-3 py-2">{children}</div>
    </div>
  );
}

export function ImageBlockPreview({
  src,
  alt,
  documentPath,
  locale,
  imageInsertMode = 'assets',
  onSourceChange
}: {
  src: string;
  alt: string;
  documentPath: string;
  locale: 'zh' | 'en';
  imageInsertMode?: 'assets' | 'embed';
  onSourceChange?: (source: string) => void;
}) {
  const [draftAlt, setDraftAlt] = useState(alt);
  const [draftSrc, setDraftSrc] = useState(src);
  const [status, setStatus] = useState('');
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const apply = (nextAlt = draftAlt, nextSrc = draftSrc) => {
    if (!onSourceChange || (nextAlt === alt && nextSrc === src)) return;
    onSourceChange(`![${nextAlt.replace(/]/g, '\\]')}](${nextSrc})`);
  };

  return (
    <div>
      <PreviewImage src={src} alt={alt} documentPath={documentPath} locale={locale} />
      {onSourceChange && (
        <div className="mt-2 grid gap-2 rounded-md bg-bg-panel/60 p-2 text-[11px] sm:grid-cols-2">
          <label className="grid gap-1 text-text-secondary">
            <span>{t('替代文本', 'Alt text')}</span>
            <input value={draftAlt} onChange={(event) => setDraftAlt(event.target.value)} onBlur={() => apply()} className="rounded border border-border-subtle bg-bg-base px-2 py-1.5 text-text-primary outline-none focus:border-accent" />
          </label>
          <label className="grid gap-1 text-text-secondary">
            <span>{t('图片路径', 'Image path')}</span>
            <input value={draftSrc} onChange={(event) => setDraftSrc(event.target.value)} onBlur={() => apply()} className="rounded border border-border-subtle bg-bg-base px-2 py-1.5 font-mono text-text-primary outline-none focus:border-accent" />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="button" className="rounded border border-border-subtle px-2 py-1 hover:bg-bg-hover" onClick={async () => {
              try {
                const asset = await pickAndImportMarkdownAsset(documentPath, 'image', imageInsertMode);
                if (!asset) return;
                setDraftSrc(asset.markdownSrc);
                setStatus(t('图片已替换', 'Image replaced'));
                apply(draftAlt, asset.markdownSrc);
              } catch (error) {
                setStatus(error instanceof Error ? error.message : String(error));
              }
            }}>{t('替换图片', 'Replace image')}</button>
            <button type="button" className="rounded border border-border-subtle px-2 py-1 hover:bg-bg-hover" onClick={() => void navigator.clipboard.writeText(draftSrc)}>{t('复制路径', 'Copy path')}</button>
            <span role="status" className="text-text-tertiary">{status}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeBlockPreview({ source, language }: { source: string; language: string }) {
  return (
    <PreviewCodeBlock inline={false} className={`language-${language || 'text'}`}>
      {`${source}\n`}
    </PreviewCodeBlock>
  );
}

export function MathBlockPreview({ source, display }: { source: string; display: boolean }) {
  const [revision, setRevision] = useState(0);
  let html = '';
  let error = '';
  try {
    html = katex.renderToString(source, { displayMode: display, throwOnError: true, output: 'htmlAndMathml' });
  } catch (reason) {
    error = reason instanceof Error ? reason.message : String(reason);
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-left text-[12px] text-red-900 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200">
        <div className="font-semibold">Formula render failed</div>
        <div className="mt-1 whitespace-pre-wrap opacity-90">{error}</div>
        <button
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          className="mt-2 rounded border border-current/30 px-2 py-1"
        >
          Retry {revision > 0 ? `(${revision})` : ''}
        </button>
      </div>
    );
  }

  return display
    ? <div className="overflow-x-auto py-3" dangerouslySetInnerHTML={{ __html: html }} />
    : <span className="inkstack-wysiwyg-rendered-math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function TableBlockPreview({ source, locale, onSourceChange }: { source: string; locale: 'zh' | 'en'; onSourceChange?: (source: string) => void }) {
  if (onSourceChange) {
    return <TableEditorWidget source={source} locale={locale} onSourceChange={onSourceChange} />;
  }
  const components = {
    table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
      <PreviewTable locale={locale} {...props}>{children}</PreviewTable>
    ),
    th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
      <th className="border-b border-border-subtle bg-bg-panel p-3 font-semibold" {...props} />
    ),
    td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td className="border-b border-border-subtle p-3" {...props} />
    )
  };

  return (
    <div className="inkstack-reading-surface prose max-w-none dark:prose-invert">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </Markdown>
    </div>
  );
}

export function FrontmatterBlockPreview({ source, locale }: { source: string; locale: 'zh' | 'en' }) {
  const lines = source.split(/\r?\n/).slice(1, -1).filter((line) => line.trim());
  return (
    <details className="rounded-md bg-bg-panel/60 px-3 py-2 text-[12px] text-text-secondary">
      <summary className="cursor-pointer font-medium text-text-primary">
        {locale === 'zh' ? `文档元数据 · ${lines.length} 行` : `Document metadata · ${lines.length} lines`}
      </summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{lines.join('\n')}</pre>
    </details>
  );
}

export function TocBlockPreview({
  headings,
  locale,
  onNavigate
}: {
  headings: Array<{ level: number; text: string; from: number }>;
  locale: 'zh' | 'en';
  onNavigate: (from: number) => void;
}) {
  return (
    <nav aria-label={locale === 'zh' ? '文档目录' : 'Document outline'} className="rounded-md bg-bg-panel/55 p-3">
      <div className="mb-2 text-[12px] font-semibold text-text-primary">{locale === 'zh' ? '目录' : 'Table of contents'}</div>
      {headings.length === 0 ? (
        <p className="text-[11px] text-text-tertiary">{locale === 'zh' ? '当前文档没有标题。' : 'This document has no headings.'}</p>
      ) : headings.map((heading, index) => (
        <button
          key={`${heading.from}:${index}`}
          type="button"
          onClick={() => onNavigate(heading.from)}
          className="block w-full rounded px-2 py-1 text-left text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          style={{ paddingLeft: `${0.5 + Math.max(0, heading.level - 1) * 0.75}rem` }}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}

export function DefinitionListBlockPreview({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const term = lines[0]?.trim() ?? '';
  const definitions = lines.slice(1).map((line) => line.replace(/^\s*:\s*/, '')).filter(Boolean);
  return (
    <dl className="border-l-2 border-accent/50 pl-3 text-[13px]">
      <dt className="font-semibold text-text-primary">{term}</dt>
      {definitions.map((definition, index) => <dd key={index} className="mt-1 text-text-secondary">{definition}</dd>)}
    </dl>
  );
}

export function HtmlBlockPreview({ source, locale }: { source: string; locale: 'zh' | 'en' }) {
  return (
    <div>
      <div role="status" className="mb-2 rounded bg-bg-panel px-2 py-1 text-[11px] text-text-tertiary">
        {locale === 'zh' ? '以下为安全过滤后的 HTML 预览；修改请使用“编辑源码”。' : 'Sanitized HTML preview. Use Edit source to make changes.'}
      </div>
      <div className="inkstack-reading-surface prose max-w-none dark:prose-invert">
        <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{source}</Markdown>
      </div>
    </div>
  );
}

export function SourceFallbackPreview({ source, locale, reason }: { source: string; locale: 'zh' | 'en'; reason?: string }) {
  return (
    <div role="status" className="rounded-md border border-amber-300/70 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/25 dark:text-amber-100">
      <div className="text-[12px] font-semibold">
        {locale === 'zh' ? '已保留源码，暂不提供可视编辑' : 'Source preserved; visual editing is not available'}
      </div>
      {reason && <div className="mt-1 text-[11px] opacity-75">{reason}</div>}
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-bg-base/70 p-2 font-mono text-[11px] text-text-primary">{source}</pre>
    </div>
  );
}
