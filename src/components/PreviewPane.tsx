import Markdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css'; // Always dark for code blocks for better contrast
import type { CSSProperties } from 'react';
import { FileCode2 } from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import {
  buildHeadingIndex,
  childrenToPlainText,
  injectTocPlaceholder,
  rehypePlugins,
  remarkPlugins,
  stripFrontMatter,
  TOC_PLACEHOLDER
} from '../features/preview/markdownPipeline';
import { PreviewCodeBlock } from '../features/preview/PreviewCodeBlock';
import { PreviewHeading } from '../features/preview/PreviewHeading';
import { PreviewImage } from '../features/preview/PreviewImage';
import { PreviewTable } from '../features/preview/PreviewTable';
import { PreviewToc } from '../features/preview/PreviewToc';
import { useDebouncedValue } from '../features/preview/useDebouncedValue';

const PREVIEW_DEBOUNCE_MS = 180;

export function PreviewPane() {
  const { activeFileContent, viewMode, activeFile, locale, readingSettings } = useStore();
  const markdownContent = stripFrontMatter(activeFileContent);
  const headings = buildHeadingIndex(markdownContent);
  const preparedMarkdown = injectTocPlaceholder(markdownContent);
  const displayContent = preparedMarkdown || (locale === 'zh' ? '*这是一个空的文档。*' : '*This document is empty.*');
  const debouncedContent = useDebouncedValue(displayContent, PREVIEW_DEBOUNCE_MS);
  const previewStyle = {
    '--inkstack-reading-width': `${readingSettings.width}px`,
    '--inkstack-reading-font-size': `${readingSettings.fontSize}px`,
    '--inkstack-reading-line-height': String(readingSettings.lineHeight),
    '--inkstack-reading-paragraph-spacing': `${readingSettings.paragraphSpacing}em`,
    '--inkstack-reading-font-family': readingSettings.font === 'serif'
      ? 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'
      : 'var(--font-sans)'
  } as CSSProperties;

  if (!activeFile && viewMode === 'read') {
    return (
       <div className="flex-1 h-full flex items-center justify-center text-text-tertiary bg-bg-base">
         <p className="text-[13px]">{locale === 'zh' ? '无活动文档' : 'No active document'}</p>
       </div>
    );
  }

  if (activeFile && !activeFile.isMarkdown) {
    return (
      <div className={cn(
        "h-full items-center justify-center bg-bg-base text-text-tertiary",
        viewMode === 'edit' ? 'hidden' : 'flex-1 flex',
        viewMode === 'read' ? 'max-w-4xl mx-auto border-x border-border-subtle shadow-sm' : 'border-l border-border-subtle'
      )}>
        <div className="flex flex-col items-center gap-3 text-center">
          <FileCode2 size={26} className="text-accent opacity-70" />
          <div className="text-[13px] text-text-secondary">
            {locale === 'zh' ? '代码/文本文件使用只读代码视图' : 'Code and text files use the read-only code view'}
          </div>
          <div className="text-[11px] font-mono">
            {activeFile.language || activeFile.fileKind}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={previewStyle} className={cn(
      "h-full overflow-y-auto px-8 py-10 lg:px-12",
      viewMode === 'edit' ? 'hidden' : 'flex-1',
      viewMode === 'read' ? 'mx-auto border-x border-border-subtle bg-bg-base shadow-sm' : 'border-l border-border-subtle bg-bg-base'
    )}>
      <div className="inkstack-reading-surface prose dark:prose-invert prose-p:text-text-primary prose-headings:text-text-primary max-w-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-img:rounded-md prose-img:border prose-img:border-border-subtle prose-a:text-accent prose-headings:scroll-mt-20">
        <Markdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={{
            code: PreviewCodeBlock,
            h1: ({node, children, ...props}) => <PreviewHeading level={1} headings={headings} {...props}>{children}</PreviewHeading>,
            h2: ({node, children, ...props}) => <PreviewHeading level={2} headings={headings} {...props}>{children}</PreviewHeading>,
            h3: ({node, children, ...props}) => <PreviewHeading level={3} headings={headings} {...props}>{children}</PreviewHeading>,
            h4: ({node, children, ...props}) => <PreviewHeading level={4} headings={headings} {...props}>{children}</PreviewHeading>,
            h5: ({node, children, ...props}) => <PreviewHeading level={5} headings={headings} {...props}>{children}</PreviewHeading>,
            h6: ({node, children, ...props}) => <PreviewHeading level={6} headings={headings} {...props}>{children}</PreviewHeading>,
            p: ({node, children, ...props}) => {
              if (childrenToPlainText(children).trim() === TOC_PLACEHOLDER) {
                return <PreviewToc headings={headings} locale={locale} />;
              }
              return <p {...props}>{children}</p>;
            },
            img: ({node, ...props}) => (
              <PreviewImage
                src={typeof props.src === 'string' ? props.src : ''}
                alt={typeof props.alt === 'string' ? props.alt : ''}
                documentPath={activeFile?.path || ''}
                locale={locale}
              />
            ),
            table: ({node, children, ...props}) => <PreviewTable locale={locale} {...props}>{children}</PreviewTable>,
            th: ({node, ...props}) => <th className="border-b border-border-subtle p-3 font-semibold bg-bg-panel" {...props} />,
            td: ({node, ...props}) => <td className="border-b border-border-subtle p-3" {...props} />,
          }}
        >
          {debouncedContent}
        </Markdown>
      </div>
    </div>
  );
}
