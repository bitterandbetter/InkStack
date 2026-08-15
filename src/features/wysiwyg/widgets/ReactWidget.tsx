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
    private readonly tagName: 'div' | 'span' = 'div',
    private readonly updateKey = widgetKey
  ) {
    super();
  }

  eq(other: ReactWidget) {
    return other.widgetKey === this.widgetKey;
  }

  updateDOM(dom: HTMLElement, view: EditorView, from: this) {
    if (from.updateKey !== this.updateKey || dom.tagName.toLowerCase() !== this.tagName) return false;
    const root = mountedRoots.get(dom);
    if (!root) return false;
    dom.className = this.className;
    root.render(this.renderNode(view));
    window.requestAnimationFrame(() => view.requestMeasure());
    return true;
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
    // React controls inside a replacement widget own their pointer, keyboard,
    // focus, and clipboard events. Source editing is entered explicitly through
    // the frame action, so CodeMirror must not move its selection into the block.
    return true;
  }
}
