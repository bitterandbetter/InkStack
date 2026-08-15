import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
});
