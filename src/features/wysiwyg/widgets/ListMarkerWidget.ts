import { WidgetType, type EditorView } from '@codemirror/view';

export class ListMarkerWidget extends WidgetType {
  constructor(private readonly marker: string, private readonly ordered: boolean) {
    super();
  }

  eq(other: ListMarkerWidget) {
    return other.marker === this.marker && other.ordered === this.ordered;
  }

  toDOM() {
    const marker = document.createElement('span');
    marker.className = this.ordered ? 'inkstack-wysiwyg-list-number' : 'inkstack-wysiwyg-list-bullet';
    marker.textContent = this.ordered ? this.marker : '•';
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
}

export class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly checkFrom: number,
    private readonly locale: 'zh' | 'en'
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.checkFrom === this.checkFrom && other.locale === this.locale;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;
    checkbox.className = 'inkstack-wysiwyg-task-checkbox';
    checkbox.setAttribute('aria-label', this.locale === 'zh'
      ? (this.checked ? '标记任务为未完成' : '标记任务为已完成')
      : (this.checked ? 'Mark task incomplete' : 'Mark task complete'));
    checkbox.addEventListener('mousedown', (event) => event.preventDefault());
    checkbox.addEventListener('change', () => {
      if (this.checkFrom < 0 || this.checkFrom >= view.state.doc.length) return;
      view.dispatch({
        changes: { from: this.checkFrom, to: this.checkFrom + 1, insert: checkbox.checked ? 'x' : ' ' },
        selection: view.state.selection
      });
      view.focus();
    });
    return checkbox;
  }

  ignoreEvent(event: Event) {
    return event.type !== 'change' && event.type !== 'mousedown' && event.type !== 'click';
  }
}
