import { WidgetType, type EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../../../lib/tauriRuntime';

export class LinkWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly label: string,
    private readonly target: string,
    private readonly title: string,
    private readonly locale: 'zh' | 'en'
  ) {
    super();
  }

  eq(other: LinkWidget) {
    return other.from === this.from
      && other.to === this.to
      && other.label === this.label
      && other.target === this.target
      && other.title === this.title
      && other.locale === this.locale;
  }

  toDOM(view: EditorView) {
    const root = document.createElement('span');
    root.className = 'inkstack-wysiwyg-link-widget';
    root.contentEditable = 'false';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'inkstack-wysiwyg-link';
    trigger.textContent = this.label;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.title = this.target;
    root.appendChild(trigger);

    const popover = document.createElement('span');
    popover.className = 'inkstack-wysiwyg-link-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', this.locale === 'zh' ? '链接操作' : 'Link actions');

    const input = document.createElement('input');
    input.value = this.target;
    input.setAttribute('aria-label', this.locale === 'zh' ? '链接地址' : 'Link address');
    popover.appendChild(input);

    const actions = document.createElement('span');
    actions.className = 'inkstack-wysiwyg-link-actions';
    const status = document.createElement('span');
    status.className = 'inkstack-wysiwyg-link-status';
    status.setAttribute('role', 'status');

    const addButton = (label: string, action: () => void | Promise<void>) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        void action();
      });
      actions.appendChild(button);
    };

    addButton(this.locale === 'zh' ? '打开' : 'Open', async () => {
      try {
        if (!/^https?:\/\//i.test(input.value) && !/^mailto:/i.test(input.value)) {
          throw new Error(this.locale === 'zh' ? '仅支持打开 http、https 或 mailto 链接' : 'Only http, https, and mailto links can be opened');
        }
        if (isTauriRuntime()) await invoke('plugin:opener|open_url', { url: input.value });
        else window.open(input.value, '_blank', 'noopener,noreferrer');
        status.textContent = '';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    addButton(this.locale === 'zh' ? '应用地址' : 'Apply URL', () => {
      const nextTarget = input.value.trim();
      if (!nextTarget) {
        status.textContent = this.locale === 'zh' ? '链接地址不能为空' : 'Link address cannot be empty';
        return;
      }
      const suffix = this.title ? ` "${this.title.replace(/"/g, '\\"')}"` : '';
      const markdown = `[${this.label}](${nextTarget}${suffix})`;
      view.dispatch({ changes: { from: this.from, to: this.to, insert: markdown } });
      view.focus();
    });
    addButton(this.locale === 'zh' ? '复制地址' : 'Copy URL', async () => {
      await navigator.clipboard.writeText(input.value);
      status.textContent = this.locale === 'zh' ? '已复制' : 'Copied';
    });
    addButton(this.locale === 'zh' ? '移除链接' : 'Remove link', () => {
      view.dispatch({ changes: { from: this.from, to: this.to, insert: this.label } });
      view.focus();
    });

    popover.append(actions, status);
    root.appendChild(popover);
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      popover.hidden = !popover.hidden;
      trigger.setAttribute('aria-expanded', String(!popover.hidden));
      if (!popover.hidden) input.focus();
    });
    root.addEventListener('mousedown', (event) => event.stopPropagation());
    return root;
  }

  ignoreEvent() {
    return true;
  }
}
