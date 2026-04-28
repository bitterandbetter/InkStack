import type { ReactNode } from 'react';
import { Box, Braces, Code2, FileCode2, Hash } from 'lucide-react';
import type { OutlineItem } from '../lib/outline';
import { cn } from '../lib/utils';

export function OutlineIcon({ item }: { item: OutlineItem }) {
  if (item.type === 'heading') return <Hash size={13} className="shrink-0 text-accent" />;
  if (item.type === 'codeBlock') return <FileCode2 size={13} className="shrink-0 text-text-tertiary" />;
  if (item.symbolKind === 'class' || item.symbolKind === 'interface') return <Box size={13} className="shrink-0 text-accent" />;
  if (item.symbolKind === 'struct' || item.symbolKind === 'enum' || item.symbolKind === 'type') return <Braces size={13} className="shrink-0 text-accent" />;
  if (item.symbolKind === 'selector' || item.symbolKind === 'key' || item.symbolKind === 'section') return <Braces size={13} className="shrink-0 text-text-tertiary" />;
  return <Code2 size={13} className="shrink-0 text-accent" />;
}

export function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-3 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors",
        active ? "border-b-2 border-accent text-accent" : "text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
