import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import type { FileNode } from '../../../src/lib/fs';
import { canAutoSaveFile } from '../../../src/lib/savePolicy';
import { createDocumentSlice, type DocumentState } from '../../../src/store/documents';

function createDocumentStore() {
  return createStore<DocumentState>()((set, get) => createDocumentSlice(set, get));
}

function markdownFile(path: string): FileNode {
  return {
    name: path.split('/').pop() || path,
    kind: 'file',
    path,
    isMarkdown: true,
    isText: true,
    fileKind: 'markdown',
    language: 'markdown',
    readOnly: false,
    isLoaded: true,
    isTruncated: false
  };
}

describe('document drafts and navigation', () => {
  it('keeps new Markdown documents as unique in-memory drafts outside autosave', () => {
    const store = createDocumentStore();
    store.getState().setRootPath('/workspace');

    store.getState().createUntitledFile();
    const first = store.getState().activeFile;
    store.getState().createUntitledFile();
    const second = store.getState().activeFile;

    expect(first?.isUntitled).toBe(true);
    expect(first?.path).toMatch(/^inkstack-draft:\/\/untitled\//);
    expect(second?.path).not.toBe(first?.path);
    expect(store.getState().documentTabs).toHaveLength(2);
    expect(canAutoSaveFile(first)).toBe(false);
    expect(canAutoSaveFile(second)).toBe(false);
  });

  it('allows autosave only for existing editable Markdown files', () => {
    expect(canAutoSaveFile(markdownFile('/workspace/existing.md'))).toBe(true);
    expect(canAutoSaveFile({ ...markdownFile('/workspace/read-only.md'), readOnly: true })).toBe(false);
    expect(canAutoSaveFile({ ...markdownFile('/workspace/draft.md'), isUntitled: true })).toBe(false);
  });

  it('moves backward and forward through valid document tabs', () => {
    const store = createDocumentStore();
    store.getState().setActiveFile(markdownFile('/workspace/a.md'), 'a');
    store.getState().setActiveFile(markdownFile('/workspace/b.md'), 'b');

    expect(store.getState().canGoBack).toBe(true);
    store.getState().goBack();
    expect(store.getState().activeFile?.path).toBe('/workspace/a.md');
    expect(store.getState().canGoForward).toBe(true);

    store.getState().goForward();
    expect(store.getState().activeFile?.path).toBe('/workspace/b.md');
  });
});
