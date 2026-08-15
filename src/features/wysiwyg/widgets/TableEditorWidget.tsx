import { useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Columns3, Copy, Plus, Rows3, Trash2 } from 'lucide-react';
import {
  parseDelimitedTable,
  parseMarkdownTable,
  serializeMarkdownTable,
  tableToTsv,
  type MarkdownTableModel,
  type TableAlignment
} from '../tableModel';

export function TableEditorWidget({
  source,
  locale,
  onSourceChange
}: {
  source: string;
  locale: 'zh' | 'en';
  onSourceChange: (source: string) => void;
}) {
  const model = useMemo(() => parseMarkdownTable(source), [source]);
  const [selected, setSelected] = useState({ row: 0, column: 0 });
  const editorRef = useRef<HTMLDivElement>(null);

  if (!model) {
    return (
      <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
        {locale === 'zh' ? '表格结构不完整，已保留源码，请使用“编辑源码”修复。' : 'The table is malformed. Its source was preserved; use Edit source to repair it.'}
      </div>
    );
  }

  const update = (mutate: (draft: MarkdownTableModel) => void) => {
    const draft = { rows: model.rows.map((row) => [...row]), alignments: [...model.alignments] };
    mutate(draft);
    onSourceChange(serializeMarkdownTable(draft));
  };
  const row = Math.min(selected.row, model.rows.length - 1);
  const column = Math.min(selected.column, model.alignments.length - 1);
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en;

  const pasteGrid = (event: ClipboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n') && !text.includes(',')) return;
    event.preventDefault();
    const pasted = parseDelimitedTable(text);
    update((draft) => {
      const requiredRows = rowIndex + pasted.length;
      const requiredColumns = columnIndex + Math.max(0, ...pasted.map((pastedRow) => pastedRow.length));
      while (draft.alignments.length < requiredColumns) draft.alignments.push(null);
      while (draft.rows.length < requiredRows) draft.rows.push(Array.from({ length: draft.alignments.length }, () => ''));
      draft.rows = draft.rows.map((draftRow) => Array.from({ length: draft.alignments.length }, (_, index) => draftRow[index] ?? ''));
      pasted.forEach((pastedRow, pastedRowIndex) => pastedRow.forEach((cell, pastedColumnIndex) => {
        draft.rows[rowIndex + pastedRowIndex][columnIndex + pastedColumnIndex] = cell;
      }));
    });
  };

  const setAlignment = (alignment: TableAlignment) => update((draft) => { draft.alignments[column] = alignment; });

  return (
    <div
      ref={editorRef}
      className="inkstack-wysiwyg-table-editor"
      data-inkstack-wysiwyg-table-editor="true"
      data-inkstack-wysiwyg-interactive="true"
    >
      <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-text-secondary">
        <button type="button" onClick={() => update((draft) => draft.rows.splice(row + 1, 0, Array.from({ length: draft.alignments.length }, () => '')))} title={t('添加行', 'Add row')}><Plus size={12} /><Rows3 size={13} /></button>
        <button type="button" disabled={model.rows.length <= 1} onClick={() => update((draft) => draft.rows.splice(row, 1))} title={t('删除行', 'Delete row')}><Trash2 size={12} /><Rows3 size={13} /></button>
        <button type="button" onClick={() => update((draft) => { draft.alignments.splice(column + 1, 0, null); draft.rows.forEach((cells) => cells.splice(column + 1, 0, '')); })} title={t('添加列', 'Add column')}><Plus size={12} /><Columns3 size={13} /></button>
        <button type="button" disabled={model.alignments.length <= 1} onClick={() => update((draft) => { draft.alignments.splice(column, 1); draft.rows.forEach((cells) => cells.splice(column, 1)); })} title={t('删除列', 'Delete column')}><Trash2 size={12} /><Columns3 size={13} /></button>
        <span className="mx-1 h-4 w-px bg-border-subtle" />
        <button type="button" onClick={() => setAlignment('left')} aria-pressed={model.alignments[column] === 'left'} title={t('左对齐', 'Align left')}><AlignLeft size={14} /></button>
        <button type="button" onClick={() => setAlignment('center')} aria-pressed={model.alignments[column] === 'center'} title={t('居中对齐', 'Align center')}><AlignCenter size={14} /></button>
        <button type="button" onClick={() => setAlignment('right')} aria-pressed={model.alignments[column] === 'right'} title={t('右对齐', 'Align right')}><AlignRight size={14} /></button>
        <button type="button" className="ml-auto" onClick={() => void navigator.clipboard.writeText(tableToTsv(model))} title={t('复制 TSV', 'Copy TSV')}><Copy size={13} />{t('复制 TSV', 'Copy TSV')}</button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border-subtle">
        <table className="w-full border-collapse text-left text-[13px]">
          <tbody>
            {model.rows.map((cells, rowIndex) => (
              <tr key={rowIndex}>
                {cells.map((cell, columnIndex) => {
                  const Cell = rowIndex === 0 ? 'th' : 'td';
                  return (
                    <Cell key={columnIndex} className="border-b border-r border-border-subtle p-0 last:border-r-0">
                      <input
                        value={cell}
                        aria-label={t(`第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`, `Row ${rowIndex + 1}, column ${columnIndex + 1}`)}
                        onFocus={() => setSelected({ row: rowIndex, column: columnIndex })}
                        onChange={(event) => {
                          const next = event.target.value;
                          update((draft) => { draft.rows[rowIndex][columnIndex] = next; });
                        }}
                        onPaste={(event) => pasteGrid(event, rowIndex, columnIndex)}
                        className="w-full min-w-24 bg-transparent px-2.5 py-2 text-text-primary outline-none focus:bg-bg-hover focus:ring-2 focus:ring-inset focus:ring-accent/40"
                      />
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-text-tertiary">{t('Tab / Shift+Tab 移动单元格；可直接粘贴 TSV 或 CSV。', 'Use Tab / Shift+Tab to move; paste TSV or CSV directly.')}</p>
    </div>
  );
}
