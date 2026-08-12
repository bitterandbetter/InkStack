import { useState, useRef, type ReactNode } from 'react';
import { cn } from '../lib/utils';

type TooltipProps = {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
};

export function Tooltip({ content, children, position = 'bottom' }: TooltipProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setShow(false), 100);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show && content && (
        <div
          className={cn(
            "absolute z-50 whitespace-nowrap rounded-md border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[11px] text-text-primary shadow-lg pointer-events-none",
            positionClasses[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
