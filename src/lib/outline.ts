export type OutlineItemType = 'heading' | 'codeBlock' | 'symbol';
export type OutlineSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'struct' | 'enum' | 'impl' | 'trait' | 'method' | 'selector' | 'key' | 'section';

export interface OutlineItem {
  type: OutlineItemType;
  level: number;
  text: string;
  line: number;
  endLine?: number;
  language?: string;
  symbolKind?: OutlineSymbolKind;
}

export interface CodeBlockInfo {
  id: string;
  language: string;
  startLine: number;
  endLine: number;
  codeStartLine: number;
  code: string;
  symbols: OutlineItem[];
}

interface ActiveFence {
  marker: '`' | '~';
  length: number;
  language: string;
  startLine: number;
  lines: string[];
}

const MAX_SYMBOLS_PER_BLOCK = 40;

export function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const codeBlocks = parseCodeBlocks(content);
  const codeBlocksByStartLine = new Map(codeBlocks.map((block) => [block.startLine, block]));
  const lines = content.split(/\r?\n/);
  let fence: Pick<ActiveFence, 'marker' | 'length'> | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})([^`]*)$/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      if (!fence) {
        fence = {
          marker,
          length: fenceMatch[1].length,
        };
        const block = codeBlocksByStartLine.get(lineNumber);
        if (block) pushCodeBlock(items, block);
        return;
      }

      if (marker === fence.marker && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      return;
    }

    if (fence) {
      return;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+|$)(.*)$/);
    if (!heading) return;

    items.push({
      type: 'heading',
      level: heading[1].length,
      text: heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim() || '(untitled)',
      line: lineNumber,
    });
  });

  return items;
}

export function parseRawCodeOutline(content: string, language = 'text'): OutlineItem[] {
  return extractCodeSymbols(language, content.split(/\r?\n/), 1)
    .slice(0, 200)
    .map((symbol) => ({
      ...symbol,
      level: 1,
      language
    }));
}

export function codeFileToBlock(content: string, language = 'text'): CodeBlockInfo {
  const lines = content.split(/\r?\n/);
  return {
    id: `file-1-${lines.length}`,
    language: language || 'text',
    startLine: 1,
    endLine: lines.length,
    codeStartLine: 1,
    code: content,
    symbols: extractCodeSymbols(language, lines, 1).slice(0, MAX_SYMBOLS_PER_BLOCK)
  };
}

export function parseCodeBlocks(content: string): CodeBlockInfo[] {
  const blocks: CodeBlockInfo[] = [];
  const lines = content.split(/\r?\n/);
  let fence: ActiveFence | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})([^`]*)$/);
    if (!fenceMatch) {
      if (fence) fence.lines.push(line);
      return;
    }

    const marker = fenceMatch[1][0] as '`' | '~';
    if (!fence) {
      fence = {
        marker,
        length: fenceMatch[1].length,
        language: normalizeFenceLanguage(fenceMatch[2] ?? ''),
        startLine: lineNumber,
        lines: []
      };
      return;
    }

    if (marker === fence.marker && fenceMatch[1].length >= fence.length) {
      blocks.push(buildCodeBlock(fence, lineNumber, blocks.length));
      fence = null;
      return;
    }

    fence.lines.push(line);
  });

  if (fence) {
    blocks.push(buildCodeBlock(fence, lines.length, blocks.length));
  }

  return blocks;
}

function buildCodeBlock(fence: ActiveFence, endLine: number, index: number): CodeBlockInfo {
  const language = fence.language || 'text';
  const symbols = extractCodeSymbols(fence.language, fence.lines, fence.startLine + 1)
    .slice(0, MAX_SYMBOLS_PER_BLOCK);

  return {
    id: `${fence.startLine}-${endLine}-${index}`,
    language,
    startLine: fence.startLine,
    endLine,
    codeStartLine: fence.startLine + 1,
    code: fence.lines.join('\n'),
    symbols
  };
}

function pushCodeBlock(items: OutlineItem[], block: CodeBlockInfo) {
  const language = block.language || 'text';
  const codeBlockLevel = 2;
  const codeBlockItem: OutlineItem = {
    type: 'codeBlock',
    level: codeBlockLevel,
    text: `${language} code block`,
    line: block.startLine,
    endLine: block.endLine,
    language
  };

  items.push(codeBlockItem);

  const symbols = block.symbols.map((symbol) => ({
    ...symbol,
    level: codeBlockLevel + 1
  }));
  items.push(...symbols);
}

function normalizeFenceLanguage(info: string) {
  const language = info.trim().split(/\s+/)[0] ?? '';
  return language
    .replace(/[{}]/g, '')
    .toLowerCase();
}

function extractCodeSymbols(language: string, lines: string[], firstCodeLine: number): OutlineItem[] {
  const family = normalizeLanguageFamily(language);
  if (!family) return [];

  const symbols: OutlineItem[] = [];
  lines.forEach((line, index) => {
    const lineNumber = firstCodeLine + index;
    const symbol = matchSymbol(family, line);
    if (!symbol) return;

    symbols.push({
      type: 'symbol',
      level: 3,
      line: lineNumber,
      text: symbol.text,
      language,
      symbolKind: symbol.kind
    });
  });

  return symbols;
}

function normalizeLanguageFamily(language: string) {
  if (['js', 'jsx', 'javascript', 'mjs', 'cjs', 'ts', 'tsx', 'typescript'].includes(language)) return 'ts';
  if (['py', 'python'].includes(language)) return 'python';
  if (['rs', 'rust'].includes(language)) return 'rust';
  if (['go', 'golang'].includes(language)) return 'go';
  if (['java'].includes(language)) return 'java';
  if (['cs', 'csharp', 'c#'].includes(language)) return 'csharp';
  if (['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'].includes(language)) return 'cpp';
  if (['php'].includes(language)) return 'php';
  if (['rb', 'ruby'].includes(language)) return 'ruby';
  if (['swift'].includes(language)) return 'swift';
  if (['kt', 'kts', 'kotlin'].includes(language)) return 'kotlin';
  if (['css', 'scss', 'sass'].includes(language)) return 'css';
  if (['json', 'jsonc'].includes(language)) return 'json';
  if (['yaml', 'yml'].includes(language)) return 'yaml';
  if (['toml', 'ini', 'properties'].includes(language)) return 'config';
  return null;
}

function matchSymbol(
  family: NonNullable<ReturnType<typeof normalizeLanguageFamily>>,
  line: string
): { kind: OutlineSymbolKind; text: string } | null {
  if (family === 'ts') return matchTypeScriptSymbol(line);
  if (family === 'python') return matchPythonSymbol(line);
  if (family === 'rust') return matchRustSymbol(line);
  if (family === 'go') return matchGoSymbol(line);
  if (family === 'java') return matchJavaLikeSymbol(line);
  if (family === 'csharp') return matchJavaLikeSymbol(line);
  if (family === 'cpp') return matchCppSymbol(line);
  if (family === 'php') return matchPhpSymbol(line);
  if (family === 'ruby') return matchRubySymbol(line);
  if (family === 'swift') return matchSwiftSymbol(line);
  if (family === 'kotlin') return matchKotlinSymbol(line);
  if (family === 'css') return matchCssSymbol(line);
  if (family === 'json') return matchJsonSymbol(line);
  if (family === 'yaml') return matchYamlSymbol(line);
  if (family === 'config') return matchConfigSymbol(line);
  return null;
}

function matchTypeScriptSymbol(line: string) {
  const cleaned = line.trim();
  const functionMatch = cleaned.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (functionMatch) return symbol('function', `${functionMatch[1]}()`);

  const classMatch = cleaned.match(/^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/);
  if (classMatch) return symbol('class', classMatch[1]);

  const interfaceMatch = cleaned.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/);
  if (interfaceMatch) return symbol('interface', interfaceMatch[1]);

  const typeMatch = cleaned.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/);
  if (typeMatch) return symbol('type', typeMatch[1]);

  const arrowMatch = cleaned.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
  if (arrowMatch) return symbol('function', `${arrowMatch[1]}()`);

  const methodMatch = cleaned.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[{:]?/);
  if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(methodMatch[1])) {
    return symbol('method', `${methodMatch[1]}()`);
  }

  return null;
}

function matchPythonSymbol(line: string) {
  const cleaned = line.trim();
  const classMatch = cleaned.match(/^class\s+([A-Za-z_]\w*)/);
  if (classMatch) return symbol('class', classMatch[1]);

  const defMatch = cleaned.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
  if (defMatch) return symbol('function', `${defMatch[1]}()`);

  return null;
}

function matchRustSymbol(line: string) {
  const cleaned = line.trim();
  const fnMatch = cleaned.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*(?:<|\()/);
  if (fnMatch) return symbol('function', `${fnMatch[1]}()`);

  const structMatch = cleaned.match(/^(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)/);
  if (structMatch) return symbol('struct', structMatch[1]);

  const enumMatch = cleaned.match(/^(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)/);
  if (enumMatch) return symbol('enum', enumMatch[1]);

  const traitMatch = cleaned.match(/^(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)/);
  if (traitMatch) return symbol('trait', traitMatch[1]);

  const implMatch = cleaned.match(/^impl(?:<[^>]+>)?\s+(.+?)(?:\s+for\s+.+)?\s*\{?$/);
  if (implMatch) return symbol('impl', `impl ${implMatch[1].trim()}`);

  return null;
}

function matchGoSymbol(line: string) {
  const cleaned = line.trim();
  const funcMatch = cleaned.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(/);
  if (funcMatch) return symbol('function', `${funcMatch[1]}()`);

  const structMatch = cleaned.match(/^type\s+([A-Za-z_]\w*)\s+struct\b/);
  if (structMatch) return symbol('struct', structMatch[1]);

  const interfaceMatch = cleaned.match(/^type\s+([A-Za-z_]\w*)\s+interface\b/);
  if (interfaceMatch) return symbol('interface', interfaceMatch[1]);

  return null;
}

function matchJavaLikeSymbol(line: string) {
  const cleaned = line.trim();
  const classMatch = cleaned.match(/^(?:public|private|protected|internal|abstract|sealed|static|final|\s)*\s*class\s+([A-Za-z_]\w*)/);
  if (classMatch) return symbol('class', classMatch[1]);

  const interfaceMatch = cleaned.match(/^(?:public|private|protected|internal|\s)*\s*interface\s+([A-Za-z_]\w*)/);
  if (interfaceMatch) return symbol('interface', interfaceMatch[1]);

  const methodMatch = cleaned.match(/^(?:public|private|protected|internal|static|final|async|virtual|override|sealed|\s)+[\w<>\[\],.?]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{?/);
  if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
    return symbol('method', `${methodMatch[1]}()`);
  }

  return null;
}

function matchCppSymbol(line: string) {
  const cleaned = line.trim();
  const classMatch = cleaned.match(/^(?:template\s*<[^>]+>\s*)?(class|struct)\s+([A-Za-z_]\w*)/);
  if (classMatch) return symbol(classMatch[1] === 'struct' ? 'struct' : 'class', classMatch[2]);

  const enumMatch = cleaned.match(/^enum(?:\s+class)?\s+([A-Za-z_]\w*)/);
  if (enumMatch) return symbol('enum', enumMatch[1]);

  const functionMatch = cleaned.match(/^(?:[\w:*&<>,~]+\s+)+([A-Za-z_~]\w*)\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:override\s*)?\{?$/);
  if (functionMatch && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(functionMatch[1])) {
    return symbol('function', `${functionMatch[1]}()`);
  }

  return null;
}

function matchPhpSymbol(line: string) {
  const cleaned = line.trim();
  const classMatch = cleaned.match(/^(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/);
  if (classMatch) return symbol('class', classMatch[1]);

  const interfaceMatch = cleaned.match(/^interface\s+([A-Za-z_]\w*)/);
  if (interfaceMatch) return symbol('interface', interfaceMatch[1]);

  const functionMatch = cleaned.match(/^(?:public|private|protected|static|\s)*function\s+([A-Za-z_]\w*)\s*\(/);
  if (functionMatch) return symbol('function', `${functionMatch[1]}()`);

  return null;
}

function matchRubySymbol(line: string) {
  const cleaned = line.trim();
  const classMatch = cleaned.match(/^class\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/);
  if (classMatch) return symbol('class', classMatch[1]);

  const moduleMatch = cleaned.match(/^module\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/);
  if (moduleMatch) return symbol('type', moduleMatch[1]);

  const methodMatch = cleaned.match(/^def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)\b/);
  if (methodMatch) return symbol('method', `${methodMatch[1]}()`);

  return null;
}

function matchSwiftSymbol(line: string) {
  const cleaned = line.trim();
  const typeMatch = cleaned.match(/^(?:public|private|internal|open|final|\s)*(class|struct|enum|protocol)\s+([A-Za-z_]\w*)/);
  if (typeMatch) {
    const kind = typeMatch[1] === 'protocol' ? 'interface' : typeMatch[1] as OutlineSymbolKind;
    return symbol(kind, typeMatch[2]);
  }

  const functionMatch = cleaned.match(/^(?:public|private|internal|open|static|mutating|\s)*func\s+([A-Za-z_]\w*)\s*\(/);
  if (functionMatch) return symbol('function', `${functionMatch[1]}()`);

  return null;
}

function matchKotlinSymbol(line: string) {
  const cleaned = line.trim();
  const typeMatch = cleaned.match(/^(?:public|private|internal|open|data|sealed|abstract|\s)*(class|interface|object|enum\s+class)\s+([A-Za-z_]\w*)/);
  if (typeMatch) {
    const kind = typeMatch[1] === 'interface' ? 'interface' : typeMatch[1].startsWith('enum') ? 'enum' : 'class';
    return symbol(kind, typeMatch[2]);
  }

  const functionMatch = cleaned.match(/^(?:public|private|internal|override|suspend|\s)*fun\s+(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)\s*\(/);
  if (functionMatch) return symbol('function', `${functionMatch[1]}()`);

  return null;
}

function matchCssSymbol(line: string) {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith('@') || cleaned.startsWith('/*') || !cleaned.endsWith('{')) return null;
  const selector = cleaned.replace(/\s*\{$/, '').trim();
  if (!selector || selector.length > 80) return null;
  return symbol('selector', selector);
}

function matchJsonSymbol(line: string) {
  const cleaned = line.trim();
  const keyMatch = cleaned.match(/^"([^"]+)"\s*:\s*(?:\{|\[)/);
  if (keyMatch) return symbol('key', keyMatch[1]);
  return null;
}

function matchYamlSymbol(line: string) {
  const keyMatch = line.match(/^([A-Za-z0-9_.-][\w.-]*)\s*:\s*(?:$|[#[{])/);
  if (keyMatch) return symbol('key', keyMatch[1]);
  return null;
}

function matchConfigSymbol(line: string) {
  const cleaned = line.trim();
  const sectionMatch = cleaned.match(/^\[([^\]]+)\]$/);
  if (sectionMatch) return symbol('section', sectionMatch[1]);

  const keyMatch = cleaned.match(/^([A-Za-z0-9_.-]+)\s*=/);
  if (keyMatch) return symbol('key', keyMatch[1]);

  return null;
}

function symbol(kind: OutlineSymbolKind, text: string) {
  return { kind, text };
}
