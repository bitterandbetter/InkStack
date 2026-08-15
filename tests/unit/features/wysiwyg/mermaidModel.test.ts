import { describe, expect, it } from 'vitest';
import { parseMermaidNodes, updateMermaidNodeLabel } from '../../../../src/features/wysiwyg/mermaidModel';

describe('WYSIWYG Mermaid model', () => {
  it('finds common flowchart node shapes without changing the graph structure', () => {
    const source = [
      'flowchart TD',
      '  A[开始] --> B("处理中")',
      '  B --> C{完成了吗}',
      '  C --> D((结束))'
    ].join('\n');

    expect(parseMermaidNodes(source).map(({ id, label, line }) => ({ id, label, line }))).toEqual([
      { id: 'A', label: '开始', line: 2 },
      { id: 'B', label: '处理中', line: 2 },
      { id: 'C', label: '完成了吗', line: 3 },
      { id: 'D', label: '结束', line: 4 }
    ]);
  });

  it('replaces only the selected node label', () => {
    const source = 'flowchart LR\n  A[旧名称] --> B[保持不变]';
    const [node] = parseMermaidNodes(source);

    expect(updateMermaidNodeLabel(source, node, '新名称')).toBe(
      'flowchart LR\n  A[新名称] --> B[保持不变]'
    );
  });

  it('rejects text that would break the existing node delimiter', () => {
    const source = 'flowchart LR\n  A[节点]';
    const [node] = parseMermaidNodes(source);

    expect(() => updateMermaidNodeLabel(source, node, '错误]文字')).toThrow('closing delimiter');
  });
});
