import { LogOut, Minus } from 'lucide-react';
import { useStore } from '../store';
import { invoke, listen } from '../lib/tauriRuntime';
import { useEffect, useState } from 'react';
import { ensureCanReplaceWorkspaceDocuments } from '../lib/desktopActions';

export function CloseConfirmDialog() {
  const [show, setShow] = useState(false);
  const locale = useStore((s) => s.locale);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    
    const setupListener = async () => {
      try {
        unlistenFn = await listen('close-confirmed', () => {
          setShow(true);
        });
      } catch (error) {
        console.error('Failed to setup close listener:', error);
      }
    };
    
    void setupListener();
    
    return () => {
      unlistenFn?.();
    };
  }, []);

  const handleMinimize = async () => {
    setShow(false);
    try {
      await invoke('minimize_window');
    } catch (error) {
      console.error('Failed to minimize:', error);
    }
  };

  const handleQuit = async () => {
    setShow(false);
    try {
      if (!(await ensureCanReplaceWorkspaceDocuments())) {
        setShow(true);
        return;
      }
      await invoke('confirm_close_app');
    } catch (error) {
      console.error('Failed to quit:', error);
      setShow(true);
    }
  };

  const handleCancel = () => {
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4">
      <div className="w-[26rem] rounded-lg border border-border-subtle bg-bg-base shadow-2xl">
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {locale === 'zh' ? '关闭 InkStack' : 'Quit InkStack'}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            {locale === 'zh'
              ? '你是想最小化窗口，还是完全退出应用？'
              : 'Would you like to minimize the window or quit the application?'}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button
            onClick={handleCancel}
            className="rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleMinimize}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-panel px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          >
            <Minus size={14} />
            {locale === 'zh' ? '最小化' : 'Minimize'}
          </button>
          <button
            onClick={handleQuit}
            className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-600"
          >
            <LogOut size={14} />
            {locale === 'zh' ? '退出' : 'Quit'}
          </button>
        </div>
      </div>
    </div>
  );
}
