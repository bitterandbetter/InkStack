import type { HeadingEntry } from './markdownPipeline';

export function PreviewToc({ headings, locale }: { headings: HeadingEntry[]; locale: 'zh' | 'en' }) {
  const visibleHeadings = headings.filter((heading) => heading.level >= 1 && heading.level <= 4);
  if (visibleHeadings.length === 0) {
    return (
      <div className="my-6 rounded-md border border-border-subtle bg-bg-panel px-4 py-3 text-[13px] text-text-tertiary">
        {locale === 'zh' ? '当前文档没有可生成目录的标题。' : 'No headings available for a table of contents.'}
      </div>
    );
  }

  return (
    <nav className="my-6 rounded-md border border-border-subtle bg-bg-panel px-4 py-3 text-[13px]" aria-label="Table of contents">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
        {locale === 'zh' ? '目录' : 'Table of Contents'}
      </div>
      <ol className="m-0 list-none space-y-1 p-0">
        {visibleHeadings.map((heading) => (
          <li key={heading.slug} style={{ paddingLeft: `${Math.max(heading.level - 1, 0) * 12}px` }}>
            <a href={`#${heading.slug}`} className="text-text-secondary no-underline hover:text-accent hover:underline">
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
