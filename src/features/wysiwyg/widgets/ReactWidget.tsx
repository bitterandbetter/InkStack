import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WidgetType, type EditorView } from '@codemirror/view';

const mountedRoots = new WeakMap<HTMLElement, Root>();
const resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

export class ReactWidget extends WidgetType {
  constructor(
    private readonly widgetKey: string,
    private readonly renderNode: (view: EditorView) => ReactNode,
    private readonly className = '',
    private readonly tagName: 'div' | 'span' = 'div'
  ) {
    super();
  }

  eq(other: ReactWidget) {
    return other.widgetKey === this.widgetKey;
  }

  toDOM(view: EditorView) {
    const container = document.createElement(this.tagName);
    container.className = this.className;
    container.contentEditable = 'false';
    const root = createRoot(container);
    mountedRoots.set(container, root);
    root.render(this.renderNode(view));
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        window.requestAnimationFrame(() => view.requestMeasure());
      });
      observer.observe(container);
      resizeObservers.set(container, observer);
    } else {
      window.requestAnimationFrame(() => view.requestMeasure());
    }
    return container;
  }

  destroy(dom: HTMLElement) {
    resizeObservers.get(dom)?.disconnect();
    resizeObservers.delete(dom);
    const root = mountedRoots.get(dom);
    if (!root) return;
    root.unmount();
    mountedRoots.delete(dom);
  }

  ignoreEvent() {
    return false;
  }
}
