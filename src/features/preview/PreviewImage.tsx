import { convertFileSrc } from '@tauri-apps/api/core';
import { ImageOff, Maximize2, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { resolveMarkdownAsset } from '../../lib/fs';
import { isTauriRuntime } from '../../lib/tauriRuntime';

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
  const [revision, setRevision] = useState(0);
  const displaySrc = failed ? src : resolvedSrc;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setIsOpen(false);

    if (!src || isRemoteAsset(src)) {
      setResolvedSrc(src);
      return;
    }

    void resolveMarkdownAsset(documentPath, src)
      .then((path) => {
        if (!cancelled) setResolvedSrc(isTauriRuntime() ? convertFileSrc(path) : path);
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
  }, [documentPath, revision, src]);

  if (failed) {
    return (
      <span className="my-6 block rounded-md border border-dashed border-border-subtle bg-bg-panel px-3 py-2 text-[13px] text-text-secondary" data-inkstack-preview="missing-image">
        <span className="flex items-center gap-2 font-medium text-text-primary">
          <ImageOff size={15} />
          {locale === 'zh' ? '图片无法加载' : 'Image unavailable'}
        </span>
        <code className="mt-1 block truncate text-[12px] text-text-tertiary">{src}</code>
        <span className="mt-2 block text-[12px] leading-relaxed text-text-tertiary">
          {locale === 'zh'
            ? '请检查相对路径是否存在，或将图片拖入编辑器自动复制到 assets 后重新插入。'
            : 'Check that the relative path exists, or drag the image into the editor to copy it into assets and insert it again.'}
        </span>
        <button
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          className="mt-2 inline-flex items-center gap-1 rounded border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          <RotateCcw size={12} />
          {locale === 'zh' ? '重试' : 'Retry'}
        </button>
      </span>
    );
  }

  return (
    <>
      <span className="group relative my-6 block w-fit max-w-full" data-inkstack-preview="image">
        <img
          src={displaySrc}
          alt={alt}
          className="max-h-[70vh] max-w-full cursor-zoom-in rounded-md border border-border-subtle object-contain"
          onError={() => setFailed(true)}
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
            src={displaySrc}
            alt={alt}
            className="max-h-full max-w-full object-contain"
            onError={() => setFailed(true)}
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
