import { describe, expect, it } from 'vitest';
import {
  parseDelimitedTable,
  parseMarkdownTable,
  serializeMarkdownTable,
  tableToTsv
} from '../../../../src/features/wysiwyg/tableModel';

describe('WYSIWYG table model', () => {
  it('parses alignment and preserves escaped pipes and inline formatting', () => {
    const model = parseMarkdownTable([
      '| 名称 | 状态 | 备注 |',
      '| :--- | :---: | ---: |',
      '| 标题 | **完成** | `A \\| B` |'
    ].join('\n'));

    expect(model).toEqual({
      rows: [
        ['名称', '状态', '备注'],
        ['标题', '**完成**', '`A | B`']
      ],
      alignments: ['left', 'center', 'right']
    });
    expect(serializeMarkdownTable(model!)).toContain('`A \\| B`');
  });

  it('rejects malformed dividers without rewriting the source', () => {
    expect(parseMarkdownTable('| A | B |\n| -- | --- |\n| 1 | 2 |')).toBeNull();
  });

  it('imports TSV and quoted CSV grids', () => {
    expect(parseDelimitedTable('A\tB\n中\t文')).toEqual([['A', 'B'], ['中', '文']]);
    expect(parseDelimitedTable('A,"B, C"\n1,2')).toEqual([['A', 'B, C'], ['1', '2']]);
  });

  it('exports table content as TSV', () => {
    const model = parseMarkdownTable('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(tableToTsv(model!)).toBe('A\tB\n1\t2');
  });
});
