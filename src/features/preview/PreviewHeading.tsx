import type { ElementType } from 'react';
import { childrenToPlainText, HeadingEntry, slugifyHeading } from './markdownPipeline';

export function PreviewHeading({
  level,
  headings,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  headings: HeadingEntry[];
}) {
  const text = childrenToPlainText(children);
  const slug = headings.find((heading) => heading.level === level && heading.text === text)?.slug
    ?? slugifyHeading(text);
  const Tag = `h${level}` as ElementType;

  return (
    <Tag id={slug} {...props}>
      <a href={`#${slug}`} className="no-underline hover:underline">
        {children}
      </a>
    </Tag>
  );
}
