import type { FileNode } from './fs';

export function canAutoSaveFile(
  file: FileNode | null | undefined
): file is FileNode & { path: string; isMarkdown: true; readOnly?: false; isUntitled?: false } {
  return Boolean(
    file?.path
    && file.isMarkdown
    && !file.readOnly
    && !file.isUntitled
  );
}
