import { convertFileSrc } from '@tauri-apps/api/core';
import { ImageOff, Maximize2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { resolveMarkdownAsset } from '../../lib/fs';

export function PreviewImage({
  src,
  alt,
  documentPath,
  locale
}: {
  src: string;
  alt: string;
  documentPath: string;
  locale: 'zh' | 'en';
}) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (!src || isRemoteAsset(src)) {
      setResolvedSrc(src);
      return;
    }

    void resolveMarkdownAsset(documentPath, src)
      .then((path) => {
        if (!cancelled) setResolvedSrc(convertFileSrc(path));
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setResolvedSrc(src);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentPath, src]);

  if (failed) {
    return (
      <span className="my-6 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-panel px-3 py-2 text-[13px] text-text-tertiary">
        <ImageOff size={15} />
        {locale === 'zh' ? '图片无法加载' : 'Image unavailable'}: <code className="text-[12px]">{src}</code>
      </span>
    );
  }

  return (
    <>
      <span className="group relative my-6 block w-fit max-w-full">
        <img
          src={resolvedSrc}
          alt={alt}
          className="max-h-[70vh] max-w-full cursor-zoom-in rounded-md border border-border-subtle object-contain"
          onClick={() => setIsOpen(true)}
        />
        <button
          onClick={() => setIsOpen(true)}
          className="absolute right-2 top-2 rounded border border-border-subtle bg-bg-base/80 p-1.5 text-text-secondary opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-text-primary group-hover:opacity-100"
          title={locale === 'zh' ? '放大查看图片' : 'Zoom image'}
        >
          <Maximize2 size={14} />
        </button>
      </span>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/95 p-8 backdrop-blur" onClick={() => setIsOpen(false)}>
          <button
            onClick={() => setIsOpen(false)}
            className="absolute right-6 top-6 rounded-full bg-bg-panel p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title={locale === 'zh' ? '关闭' : 'Close'}
          >
            <X size={24} />
          </button>
          <img
            src={resolvedSrc}
            alt={alt}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function isRemoteAsset(src: string) {
  return /^(https?:|data:|blob:)/i.test(src);
}
