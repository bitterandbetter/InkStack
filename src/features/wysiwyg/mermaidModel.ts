export type MermaidEditableNode = {
  id: string;
  label: string;
  labelFrom: number;
  labelTo: number;
  line: number;
  closeDelimiter: string;
};

type NodeDelimiter = {
  open: string;
  close: string;
};

// Longest delimiters must be checked first so circles, databases, and
// subroutines are not mistaken for their shorter bracket variants.
const NODE_DELIMITERS: NodeDelimiter[] = [
  { open: '(((', close: ')))' },
  { open: '[[', close: ']]' },
  { open: '[(', close: ')]' },
  { open: '([', close: '])' },
  { open: '((', close: '))' },
  { open: '{{', close: '}}' },
  { open: '[/', close: '/]' },
  { open: '[\\', close: '\\]' },
  { open: '[/', close: '\\]' },
  { open: '[\\', close: '/]' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '{', close: '}' },
  { open: '>', close: ']' }
];

export function parseMermaidNodes(source: string): MermaidEditableNode[] {
  const byId = new Map<string, MermaidEditableNode>();
  let offset = 0;

  source.split(/\r?\n/).forEach((line, lineIndex) => {
    const commentAt = line.indexOf('%%');
    const searchable = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const identifier = /[A-Za-z_][\w-]*/g;
    let match: RegExpExecArray | null;

    while ((match = identifier.exec(searchable))) {
      const id = match[0];
      let delimiterAt = identifier.lastIndex;
      while (/\s/.test(searchable[delimiterAt] ?? '')) delimiterAt += 1;
      const delimiter = NODE_DELIMITERS.find(({ open }) => searchable.startsWith(open, delimiterAt));
      if (!delimiter) continue;

      const rawLabelFrom = delimiterAt + delimiter.open.length;
      const closeAt = searchable.indexOf(delimiter.close, rawLabelFrom);
      if (closeAt < 0) continue;

      const rawLabel = searchable.slice(rawLabelFrom, closeAt);
      const leadingWhitespace = rawLabel.length - rawLabel.trimStart().length;
      const trailingWhitespace = rawLabel.length - rawLabel.trimEnd().length;
      let labelFrom = rawLabelFrom + leadingWhitespace;
      let labelTo = closeAt - trailingWhitespace;

      const first = searchable[labelFrom];
      const last = searchable[labelTo - 1];
      if ((first === '"' || first === "'") && last === first && labelTo - labelFrom >= 2) {
        labelFrom += 1;
        labelTo -= 1;
      }

      byId.set(id, {
        id,
        label: searchable.slice(labelFrom, labelTo),
        labelFrom: offset + labelFrom,
        labelTo: offset + labelTo,
        line: lineIndex + 1,
        closeDelimiter: delimiter.close
      });
      identifier.lastIndex = closeAt + delimiter.close.length;
    }

    offset += line.length + newlineLengthAt(source, offset + line.length);
  });

  return Array.from(byId.values()).sort((left, right) => left.labelFrom - right.labelFrom);
}

export function updateMermaidNodeLabel(
  source: string,
  node: MermaidEditableNode,
  nextLabel: string
) {
  if (nextLabel.includes('\n') || nextLabel.includes('\r')) {
    throw new Error('Mermaid node labels must stay on one line.');
  }
  if (nextLabel.includes(node.closeDelimiter)) {
    throw new Error(`The label cannot contain the node closing delimiter ${node.closeDelimiter}.`);
  }
  if (node.labelFrom < 0 || node.labelTo < node.labelFrom || node.labelTo > source.length) {
    throw new Error('The Mermaid node source range is no longer valid.');
  }
  return `${source.slice(0, node.labelFrom)}${nextLabel}${source.slice(node.labelTo)}`;
}

function newlineLengthAt(source: string, offset: number) {
  if (source.slice(offset, offset + 2) === '\r\n') return 2;
  return source[offset] === '\n' || source[offset] === '\r' ? 1 : 0;
}
