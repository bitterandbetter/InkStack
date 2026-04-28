import type { Extension } from '@codemirror/state';
import { LanguageDescription } from '@codemirror/language';

const markdownCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'jsx', 'mjs', 'cjs'],
    extensions: ['js', 'jsx', 'mjs', 'cjs'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts'],
    extensions: ['ts'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx'],
    extensions: ['tsx'],
    load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true })
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py'],
    extensions: ['py'],
    load: async () => (await import('@codemirror/lang-python')).python()
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rs'],
    extensions: ['rs'],
    load: async () => (await import('@codemirror/lang-rust')).rust()
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['jsonc'],
    extensions: ['json', 'jsonc'],
    load: async () => (await import('@codemirror/lang-json')).json()
  }),
  LanguageDescription.of({
    name: 'HTML',
    extensions: ['html', 'htm'],
    load: async () => (await import('@codemirror/lang-html')).html()
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['scss', 'sass'],
    extensions: ['css', 'scss', 'sass'],
    load: async () => (await import('@codemirror/lang-css')).css()
  }),
  LanguageDescription.of({
    name: 'SQL',
    extensions: ['sql'],
    load: async () => (await import('@codemirror/lang-sql')).sql()
  }),
  LanguageDescription.of({
    name: 'XML',
    extensions: ['xml'],
    load: async () => (await import('@codemirror/lang-xml')).xml()
  }),
  LanguageDescription.of({
    name: 'YAML',
    alias: ['yml'],
    extensions: ['yaml', 'yml'],
    load: async () => (await import('@codemirror/lang-yaml')).yaml()
  }),
];

export async function getEditorLanguageExtension(language: string): Promise<Extension> {
  const normalized = language.toLowerCase();
  if (normalized === 'markdown' || normalized === 'md' || normalized === 'mdx') {
    const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown');
    return markdown({ base: markdownLanguage, codeLanguages: markdownCodeLanguages });
  }
  if (['javascript', 'js', 'mjs', 'cjs', 'jsx'].includes(normalized)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: normalized === 'jsx' });
  }
  if (['typescript', 'ts', 'tsx'].includes(normalized)) {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: normalized === 'tsx', typescript: true });
  }
  if (normalized === 'python' || normalized === 'py') return (await import('@codemirror/lang-python')).python();
  if (normalized === 'rust' || normalized === 'rs') return (await import('@codemirror/lang-rust')).rust();
  if (normalized === 'json' || normalized === 'jsonc') return (await import('@codemirror/lang-json')).json();
  if (normalized === 'html') return (await import('@codemirror/lang-html')).html();
  if (normalized === 'css' || normalized === 'scss' || normalized === 'sass') return (await import('@codemirror/lang-css')).css();
  if (normalized === 'sql') return (await import('@codemirror/lang-sql')).sql();
  if (normalized === 'xml') return (await import('@codemirror/lang-xml')).xml();
  if (normalized === 'yaml' || normalized === 'yml') return (await import('@codemirror/lang-yaml')).yaml();
  return [];
}

