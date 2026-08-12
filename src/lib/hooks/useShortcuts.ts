import { useCallback, useEffect, useState } from 'react';
import { loadShortcuts, saveShortcuts, type ShortcutConfig, parseShortcutToKeys } from '../shortcuts';
import { runAppCommand, type AppCommandId } from '../appCommands';

// Commands whose accelerator is handled by the native macOS menu. Those key
// events are consumed by the OS menu system before reaching the webview, so the
// frontend keydown handler must not re-dispatch them (otherwise they would run
// twice on platforms where the menu does not consume the event).
const NATIVE_MENU_COMMANDS = new Set<AppCommandId>([
  'new-file',
  'open-file',
  'open-workspace',
  'save',
  'save-as',
  'quit-app',
  'find',
  'open-command-palette',
  'view-edit',
  'view-split',
  'view-read',
  'view-code',
  'toggle-sidebar',
  'toggle-ai'
]);

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setShortcuts(loadShortcuts());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const pressedKey = {
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
        key: e.key.toUpperCase()
      };

      for (const shortcut of shortcuts) {
        if (NATIVE_MENU_COMMANDS.has(shortcut.id)) continue;

        const shortcutKeys = parseShortcutToKeys(shortcut.currentKeys[0]);
        if (
          shortcutKeys.ctrl === pressedKey.ctrl &&
          shortcutKeys.shift === pressedKey.shift &&
          shortcutKeys.alt === pressedKey.alt &&
          shortcutKeys.key === pressedKey.key
        ) {
          e.preventDefault();
          e.stopPropagation();
          void runAppCommand(shortcut.id as AppCommandId);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);

  const updateShortcuts = useCallback((newShortcuts: ShortcutConfig[]) => {
    setShortcuts(newShortcuts);
    saveShortcuts(newShortcuts);
  }, []);

  const resetShortcuts = useCallback(() => {
    const defaults = shortcuts.map(s => ({ ...s, currentKeys: s.defaultKeys }));
    setShortcuts(defaults);
    saveShortcuts(defaults);
  }, [shortcuts]);

  return {
    shortcuts,
    updateShortcuts,
    resetShortcuts,
    isOpen,
    setIsOpen
  };
}
