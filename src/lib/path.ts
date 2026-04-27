export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}
