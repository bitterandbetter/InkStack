import { preparePreviewMarkdown } from '../features/preview/markdownPipeline';
import { invoke } from './tauriRuntime';

let toastRef: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void } | null = null;

export function setToastRef(ref: { success: (msg: string) => void; error: (msg: string) => void; info: (msg: string) => void }) {
  toastRef = ref;
}

function notifySuccess(message: string) {
  toastRef?.success(message);
}

function notifyError(message: string) {
  toastRef?.error(message);
}

function notifyInfo(message: string) {
  toastRef?.info(message);
}

export type ExportFormat = 'html' | 'markdown' | 'pdf' | 'docx' | 'png';

export interface ExportOptions {
  format: ExportFormat;
  includeStyles?: boolean;
}

const HTML_TEMPLATE = (title: string, body: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>
  :root {
    --ink: #1f1f1f;
    --ink-muted: #6b6b6b;
    --rule: #e5e5e5;
    --accent: #007AFF;
    --accent-soft: #e8f2ff;
    --code-bg: #f7f8fa;
    --row-alt: #f9f9f9;
  }
  html, body { background: #fff; }
  body {
    max-width: 760px;
    margin: 48px auto;
    padding: 0 48px 80px;
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto,
      "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; font-weight: 700; margin: 2em 0 0.6em; }
  h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
  h1 { font-size: 2.15em; border-bottom: 2px solid var(--accent); padding-bottom: .35em; }
  h2 { font-size: 1.55em; border-bottom: 1px solid var(--rule); padding-bottom: .25em; }
  h3 { font-size: 1.25em; }
  p { margin: .9em 0; }
  a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent-soft); }
  a:hover { border-bottom-color: var(--accent); }
  code { font-family: "JetBrains Mono", "SF Mono", monospace; font-size: .9em; background: var(--code-bg); padding: .15em .45em; border-radius: 4px; }
  pre { background: var(--code-bg); padding: 16px 20px; border-radius: 8px; overflow-x: auto; margin: 1.2em 0; line-height: 1.55; border: 1px solid var(--rule); }
  pre code { background: transparent; padding: 0; font-size: .88em; }
  blockquote { border-left: 4px solid var(--accent); background: var(--accent-soft); margin: 1.4em 0; padding: .5em 1.2em; color: var(--ink-muted); font-style: italic; border-radius: 0 4px 4px 0; }
  ul, ol { padding-left: 1.8em; margin: .9em 0; }
  table { border-collapse: collapse; margin: 1.4em 0; width: 100%; font-size: .95em; }
  th, td { border: 1px solid var(--rule); padding: 8px 14px; text-align: left; }
  thead th { background: var(--accent-soft); font-weight: 700; border-bottom: 2px solid var(--accent); }
  tbody tr:nth-child(even) { background: var(--row-alt); }
  hr { border: none; border-top: 1px solid var(--rule); margin: 2.4em 0; }
  img { max-width: 100%; border-radius: 6px; margin: 1.2em 0; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
</style>
</head>
<body>
${body}
</body>
</html>`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  );
}

function markdownToHtml(markdown: string): string {
  const prepared = preparePreviewMarkdown(markdown);
  let html = prepared
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/^- (.*$)/gm, '<li>$1</li>');
  return html;
}

export async function exportToHtml(content: string, options: ExportOptions, locale: 'zh' | 'en' = 'zh'): Promise<void> {
  const title = 'Exported Document';
  const body = markdownToHtml(content);
  const html = HTML_TEMPLATE(title, body);
  await saveExportFile(`${title}.html`, html, 'html', 'html');
  notifySuccess(locale === 'zh' ? '已导出为 HTML' : 'Exported to HTML');
}

export async function exportToMarkdown(content: string, locale: 'zh' | 'en' = 'zh'): Promise<void> {
  await saveExportFile('document.md', content, 'markdown', 'md');
  notifySuccess(locale === 'zh' ? '已导出为 Markdown' : 'Exported to Markdown');
}

export async function exportToPdf(content: string, locale: 'zh' | 'en' = 'zh'): Promise<void> {
  try {
    notifyInfo(locale === 'zh' ? '正在生成 PDF...' : 'Generating PDF...');
    const html2pdf = (await import('html2pdf.js')).default;
    const body = markdownToHtml(content);
    const html = HTML_TEMPLATE('Document', body);
    
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);
    
    await new Promise(r => setTimeout(r, 100));
    
    const opt = {
      margin: 10,
      filename: 'document.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['pre', 'table', 'blockquote', 'h1', 'h2', 'h3'] }
    };
    
    await html2pdf().set(opt).from(container).save();
    document.body.removeChild(container);
    notifySuccess(locale === 'zh' ? '已导出为 PDF' : 'Exported to PDF');
  } catch (error) {
    console.error('PDF export failed:', error);
    notifyError(locale === 'zh' ? 'PDF 导出失败' : 'PDF export failed');
    throw error;
  }
}

export async function exportToDocx(content: string, locale: 'zh' | 'en' = 'zh'): Promise<void> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, AlignmentType } = docx;
  
  const lines = content.split('\n');
  const children: any[] = [];
  
  let tableCells: string[][] = [];
  
  for (const line of lines) {
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.replace(/[|\-\s]/g, '') === '') {
        continue;
      }
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      const isHeader = cells.every(c => /^[-:]+$/.test(c));
      if (!isHeader) {
        tableCells.push(cells);
      }
      continue;
    }
    
    if (tableCells.length > 0 && !line.startsWith('|')) {
      const table = buildDocxTable(tableCells);
      if (table) children.push(table);
      tableCells = [];
    }
    
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      const alt = imageMatch[1] || 'image';
      const src = imageMatch[2];
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const imageBuffer = new Uint8Array(buffer);
        const ext = src.split('.').pop()?.toLowerCase() || 'png';
        const type = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'gif' ? 'gif' : ext === 'bmp' ? 'bmp' : 'png';
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type,
                data: imageBuffer,
                transformation: { width: 400, height: 300 },
                altText: { name: alt, description: alt },
              })
            ],
            alignment: AlignmentType.CENTER,
          })
        );
      } catch {
        children.push(new Paragraph({ text: `[${alt}]`, alignment: AlignmentType.CENTER }));
      }
      continue;
    }
    
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.substring(2), heading: HeadingLevel.HEADING_1 }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.substring(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.substring(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      children.push(new Paragraph({ text: line.substring(2), bullet: { level: 0 } }));
    } else if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({ text: line.replace(/^\d+\.\s/, ''), numbering: { reference: '1', level: 0 } }));
    } else if (line.startsWith('> ')) {
      children.push(new Paragraph({ text: line.substring(2), indent: { left: 720 } }));
    } else if (line.trim() === '') {
      children.push(new Paragraph({ text: '' }));
    } else {
      children.push(new Paragraph({ text: line }));
    }
  }
  
  if (tableCells.length > 0) {
    const table = buildDocxTable(tableCells);
    if (table) children.push(table);
  }
  
  const doc = new Document({
    sections: [{ children: children.length > 0 ? children : [new Paragraph({ text: '' })] }]
  });
  
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'document.docx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notifySuccess(locale === 'zh' ? '已导出为 Word' : 'Exported to Word');
}

async function buildDocxTable(rows: string[][]): Promise<any> {
  const { Table, TableRow, TableCell, Paragraph, TextRun, BorderStyle, ShadingType, WidthType } = await import('docx');
  const colCount = Math.max(...rows.map(r => r.length));
  
  const docxRows = rows.map((row, idx) => 
    new TableRow({
      tableHeader: idx === 0,
      children: Array.from({ length: colCount }, (_, c) => 
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: row[c] || '' })] })],
          shading: idx === 0 ? { type: ShadingType.SOLID, color: 'E8F2FF', fill: 'E8F2FF' } : undefined,
        })
      )
    })
  );
  
  return new Table({
    rows: docxRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E5' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E5' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E5' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E5' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E5' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E5' },
    }
  });
}

export async function saveExportFile(
  filename: string,
  content: string,
  type: string,
  extension: string
): Promise<void> {
  try {
    await invoke<string>('save_export_file', {
      request: { filename, content, fileType: type, extension }
    });
  } catch (error) {
    console.error('Export failed, falling back to browser download', error);
    const blob = new Blob([content], { type: `text/${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export async function printDocument(content: string, locale: 'zh' | 'en' = 'zh'): Promise<void> {
  try {
    const body = markdownToHtml(content);
    const html = HTML_TEMPLATE('Document', body);
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
      notifySuccess(locale === 'zh' ? '已打开打印对话框' : 'Print dialog opened');
    }
  } catch (error) {
    console.error('Print failed:', error);
    notifyError(locale === 'zh' ? '打印失败' : 'Print failed');
    throw error;
  }
}

export async function exportToPng(content: string, locale: 'zh' | 'en' = 'zh'): Promise<void> {
  try {
    notifyInfo(locale === 'zh' ? '正在生成图片...' : 'Generating image...');
    const html2canvas = (await import('html2canvas')).default;
    const body = markdownToHtml(content);
    const html = HTML_TEMPLATE('Document', body);
    
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    document.body.appendChild(container);
    
    await new Promise(r => setTimeout(r, 100));
    
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    
    document.body.removeChild(container);
    
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png', 1.0);
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    notifySuccess(locale === 'zh' ? '已导出为图片' : 'Exported to PNG');
  } catch (error) {
    console.error('Image export failed:', error);
    notifyError(locale === 'zh' ? '图片导出失败' : 'Image export failed');
    throw error;
  }
}
