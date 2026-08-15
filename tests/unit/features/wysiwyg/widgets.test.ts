import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createWysiwygExtension } from '../../../../src/features/wysiwyg';

const views: EditorView[] = [];

function createView(doc: string, anchor: number) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [markdown(), createWysiwygExtension({ documentPath: '', locale: 'zh' })]
    })
  });
  views.push(view);
  return view;
}

afterEach(() => {
  while (views.length) {
    const view = views.pop();
    const parent = view?.dom.parentElement;
    view?.destroy();
    parent?.remove();
  }
});

describe('WYSIWYG interactive widgets', () => {
  it('removes only the Markdown link wrapper through the inline link controls', () => {
    const source = '[InkStack](https://example.com "项目")\n\n光标在这里';
    const view = createView(source, source.length);
    const trigger = view.dom.querySelector<HTMLButtonElement>('.inkstack-wysiwyg-link-widget > button');

    expect(trigger).not.toBeNull();
    trigger!.click();
    const remove = Array.from(view.dom.querySelectorAll<HTMLButtonElement>('.inkstack-wysiwyg-link-actions button'))
      .find((button) => button.textContent === '移除链接');
    expect(remove).not.toBeUndefined();
    remove!.click();

    expect(view.state.doc.toString()).toBe('InkStack\n\n光标在这里');
  });

  it('toggles one task marker without rewriting adjacent source', () => {
    const source = '- [ ] 第一个任务\n- [x] 第二个任务\n\n光标在这里';
    const view = createView(source, source.length);
    const checkbox = view.dom.querySelector<HTMLInputElement>('.inkstack-wysiwyg-task-checkbox');

    expect(checkbox).not.toBeNull();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(view.state.doc.toString()).toBe('- [x] 第一个任务\n- [x] 第二个任务\n\n光标在这里');
  });

  it('keeps the table structure visible while a cell writes through to Markdown', async () => {
    const source = '| 名称 | 状态 |\n| --- | --- |\n| 旧名称 | 正常 |\n\n光标在这里';
    const view = createView(source, source.indexOf('旧名称'));
    const input = await waitFor(() => {
      const element = view.dom.querySelector<HTMLInputElement>('input[aria-label="第 2 行第 1 列"]');
      expect(element).toBeTruthy();
      return element!;
    });

    fireEvent.change(input, { target: { value: '新名称' } });
    fireEvent.doubleClick(input);

    expect(view.state.doc.toString()).toContain('| 新名称 | 正常 |');
    await waitFor(() => expect(view.dom.querySelector('[data-inkstack-wysiwyg-table-editor="true"]')).not.toBeNull());
    expect(view.dom.querySelector('.inkstack-wysiwyg-table-source')).toBeNull();
  });

  it('edits one Mermaid node label without exposing or rewriting the graph structure', async () => {
    const source = '```mermaid\nflowchart TD\n  A[旧节点] --> B[保持不变]\n```\n\n光标在这里';
    const view = createView(source, source.indexOf('旧节点'));
    const input = await waitFor(() => {
      const editor = view.dom.querySelector<HTMLElement>('[data-inkstack-wysiwyg-mermaid-editor="true"]');
      const element = editor?.querySelector<HTMLInputElement>('input');
      expect(element).toBeTruthy();
      return element!;
    });

    fireEvent.change(input, { target: { value: '新节点' } });

    expect(view.state.doc.toString()).toContain('A[新节点] --> B[保持不变]');
    await waitFor(() => expect(view.dom.querySelector('[data-inkstack-wysiwyg-mermaid-editor="true"]')).not.toBeNull());
    expect(view.dom.querySelector('.inkstack-wysiwyg-code-block')).toBeNull();
  });

  it('opens table source only through the explicit source action', async () => {
    const source = '| 名称 | 状态 |\n| --- | --- |\n| 内容 | 正常 |\n\n光标在这里';
    const view = createView(source, source.length);
    const frame = await waitFor(() => {
      const element = view.dom.querySelector<HTMLElement>('[data-inkstack-wysiwyg-table-editor="true"]')?.closest<HTMLElement>('[data-inkstack-wysiwyg-widget="true"]');
      expect(element).toBeTruthy();
      return element!;
    });
    const editSource = Array.from(frame.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('编辑源码'));

    expect(editSource).toBeDefined();
    fireEvent.click(editSource!);

    await waitFor(() => expect(view.dom.querySelector('[data-inkstack-wysiwyg-table-editor="true"]')).toBeNull());
    expect(view.dom.querySelector('.inkstack-wysiwyg-table-source')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });
});
