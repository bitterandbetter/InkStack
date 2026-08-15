import { beforeEach, describe, expect, it } from 'vitest';
import { runAppCommand } from '../../../src/lib/appCommands';
import { useStore } from '../../../src/store';

describe('AI panel command navigation', () => {
  beforeEach(() => {
    useStore.setState({ aiPanelOpen: false, aiPanelTab: 'ai' });
  });

  it.each([
    ['ai-chat', 'ai'],
    ['ai-outline', 'outline'],
    ['ai-code', 'code'],
    ['ai-settings', 'settings']
  ] as const)('opens %s at the expected panel tab', async (command, expectedTab) => {
    await runAppCommand(command);
    expect(useStore.getState().aiPanelOpen).toBe(true);
    expect(useStore.getState().aiPanelTab).toBe(expectedTab);
  });
});

describe('view command navigation', () => {
  beforeEach(() => {
    useStore.setState({
      viewMode: 'split',
      wysiwygEnabled: true,
      activeFile: {
        name: 'document.md',
        path: '/workspace/document.md',
        kind: 'file',
        isMarkdown: true,
        isText: true,
        fileKind: 'markdown',
        language: 'markdown',
        readOnly: false,
        isLoaded: true,
        isTruncated: false
      }
    });
  });

  it.each([
    ['view-edit', 'edit'],
    ['view-split', 'split'],
    ['view-read', 'read'],
    ['view-code', 'code'],
    ['view-wysiwyg', 'wysiwyg']
  ] as const)('switches %s to %s', async (command, expectedMode) => {
    await runAppCommand(command);
    expect(useStore.getState().viewMode).toBe(expectedMode);
  });

  it('does not enter WYSIWYG for non-Markdown files', async () => {
    useStore.setState({
      activeFile: {
        ...useStore.getState().activeFile!,
        name: 'code.ts',
        path: '/workspace/code.ts',
        isMarkdown: false,
        fileKind: 'code',
        language: 'typescript'
      }
    });

    expect(await runAppCommand('view-wysiwyg')).toBe(false);
    expect(useStore.getState().viewMode).toBe('split');
  });

  it('keeps the current view when the experimental WYSIWYG setting is disabled', async () => {
    useStore.setState({ wysiwygEnabled: false });

    expect(await runAppCommand('view-wysiwyg')).toBe(false);
    expect(useStore.getState().viewMode).toBe('split');
  });
});
