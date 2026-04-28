export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface AiWorkspaceContext {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  line: number | null;
  snippet: string | null;
  content: string;
}

export interface AiSelectionAttachment {
  id: string;
  text: string;
  source: 'editor' | 'preview';
}
