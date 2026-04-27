import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Mermaid } from '../../components/Mermaid';

export function PreviewCodeBlock({ inline, className, children, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  if (!inline && language === 'mermaid') {
    return <Mermaid chart={String(children).replace(/\n$/, '')} />;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return !inline ? (
    <div className="relative group mt-4 mb-6">
      <div className="absolute top-0 right-0 py-1.5 px-3 bg-[#2a2a2a] text-[#888] text-[11px] font-mono rounded-bl-lg rounded-tr-lg flex items-center gap-2 border-b border-l border-[#333] z-10 transition-opacity">
        <span>{language || 'text'}</span>
        <button onClick={handleCopy} className="hover:text-white transition-colors" title="Copy code">
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border-subtle bg-[#1e1e1e]">
        <code className={className} {...props}>
          {children}
        </code>
      </div>
    </div>
  ) : (
    <code className="bg-bg-hover text-accent px-1.5 py-0.5 rounded text-[0.875em] font-mono border border-border-subtle before:content-hidden after:content-hidden" {...props}>
      {children}
    </code>
  );
}
