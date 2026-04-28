import { Check, Copy, Maximize2, X } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { childrenToPlainText } from './markdownPipeline';

export function PreviewTable({
  children,
  locale,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  locale: 'zh' | 'en';
}) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const rows = extractTableRows(children);
  const markdown = tableRowsToMarkdown(rows);
  const tsv = tableRowsToTsv(rows);

  const copyTable = async () => {
    await navigator.clipboard.writeText(markdown || tsv);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const table = (
    <table className="w-full text-left border-collapse" {...props}>
      {children}
    </table>
  );

  return (
    <>
      <div className="group relative my-6 overflow-hidden rounded-md border border-border-subtle bg-bg-base" data-inkstack-preview="table">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={copyTable}
            className="rounded border border-border-subtle bg-bg-base/90 p-1.5 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
            title={locale === 'zh' ? '复制表格为 Markdown' : 'Copy table as Markdown'}
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => setIsOpen(true)}
            className="rounded border border-border-subtle bg-bg-base/90 p-1.5 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
            title={locale === 'zh' ? '放大查看表格' : 'Open table viewer'}
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          {table}
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg-base/95 p-6 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0 text-[13px] font-medium text-text-primary">
              {locale === 'zh' ? '表格查看' : 'Table Viewer'}
              <span className="ml-2 text-[11px] font-normal text-text-tertiary">
                {rows.length} x {Math.max(0, ...rows.map((row) => row.length))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyTable}
                className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-2 py-1.5 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                {locale === 'zh' ? '复制 Markdown' : 'Copy Markdown'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-bg-panel p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                title={locale === 'zh' ? '关闭' : 'Close'}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border-subtle bg-bg-base p-4">
            <table className="w-max min-w-full text-left border-collapse text-[13px]" {...props}>
              {children}
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function extractTableRows(children: ReactNode): string[][] {
  const rows: string[][] = [];

  const visit = (node: ReactNode) => {
    if (!node || typeof node === 'boolean') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object' || !('type' in node)) return;

    const element = node as {
      type?: unknown;
      props?: { children?: ReactNode };
    };
    const tag = typeof element.type === 'string' ? element.type : '';
    if (tag === 'tr') {
      rows.push(extractTableCells(element.props?.children));
      return;
    }

    visit(element.props?.children);
  };

  visit(children);
  return rows.filter((row) => row.length > 0);
}

function extractTableCells(children: ReactNode): string[] {
  const cells: string[] = [];

  const visit = (node: ReactNode) => {
    if (!node || typeof node === 'boolean') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object' || !('type' in node)) return;

    const element = node as {
      type?: unknown;
      props?: { children?: ReactNode };
    };
    const tag = typeof element.type === 'string' ? element.type : '';
    if (tag === 'th' || tag === 'td') {
      cells.push(childrenToPlainText(element.props?.children).replace(/\s+/g, ' ').trim());
      return;
    }

    visit(element.props?.children);
  };

  visit(children);
  return cells;
}

function tableRowsToMarkdown(rows: string[][]) {
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  const [header, ...body] = normalizedRows;
  const divider = Array.from({ length: width }, () => '---');
  return [header, divider, ...body]
    .map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`)
    .join('\n');
}

function tableRowsToTsv(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => cell.replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'))
    .join('\n');
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
