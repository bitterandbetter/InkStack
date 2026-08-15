export type TableAlignment = 'left' | 'center' | 'right' | null;

export type MarkdownTableModel = {
  rows: string[][];
  alignments: TableAlignment[];
};

export function parseMarkdownTable(source: string): MarkdownTableModel | null {
  const lines = source.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const rows = lines.map(splitMarkdownTableRow);
  const width = rows[0]?.length ?? 0;
  if (width === 0 || rows.some((row) => row.length !== width)) return null;

  const divider = rows[1];
  const alignments: TableAlignment[] = [];
  for (const rawCell of divider) {
    const cell = rawCell.trim();
    if (!/^:?-{3,}:?$/.test(cell)) return null;
    alignments.push(cell.startsWith(':') && cell.endsWith(':')
      ? 'center'
      : cell.endsWith(':')
        ? 'right'
        : cell.startsWith(':')
          ? 'left'
          : null);
  }

  return { rows: [rows[0], ...rows.slice(2)], alignments };
}

export function serializeMarkdownTable(model: MarkdownTableModel) {
  const width = Math.max(1, model.alignments.length, ...model.rows.map((row) => row.length));
  const rows = model.rows.length > 0 ? model.rows : [Array.from({ length: width }, () => '')];
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  const divider = Array.from({ length: width }, (_, index) => alignmentMarker(model.alignments[index] ?? null));
  return [normalizedRows[0], divider, ...normalizedRows.slice(1)]
    .map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`)
    .join('\n');
}

export function tableToTsv(model: MarkdownTableModel) {
  return model.rows.map((row) => row.map((cell) => cell.replace(/\r?\n/g, ' ')).join('\t')).join('\n');
}

export function parseDelimitedTable(text: string) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : ',';
  return lines.map((line) => delimiter === '\t' ? line.split('\t') : splitCsvLine(line));
}

function splitMarkdownTableRow(line: string) {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);

  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  let codeFenceLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      cell += character === '|' ? '|' : `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '`') {
      let length = 1;
      while (value[index + length] === '`') length += 1;
      if (codeFenceLength === 0) codeFenceLength = length;
      else if (codeFenceLength === length) codeFenceLength = 0;
      cell += '`'.repeat(length);
      index += length - 1;
      continue;
    }
    if (character === '|' && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += character;
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

function alignmentMarker(alignment: TableAlignment) {
  if (alignment === 'left') return ':---';
  if (alignment === 'center') return ':---:';
  if (alignment === 'right') return '---:';
  return '---';
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/(^|[^\\])\|/g, '$1\\|');
}
