import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, type EventCallback, type Options, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow as tauriGetCurrentWindow } from '@tauri-apps/api/window';

type TauriGlobal = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean((window as TauriGlobal).__TAURI_INTERNALS__);
}

export function assertTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error('InkStack desktop APIs are unavailable. Please run this app inside the Tauri desktop window.');
  }
}

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  assertTauriRuntime();
  return tauriInvoke<T>(cmd, args);
}

export function listen<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options
): Promise<UnlistenFn> {
  assertTauriRuntime();
  return tauriListen<T>(event, handler, options);
}

export function getCurrentWindow() {
  assertTauriRuntime();
  return tauriGetCurrentWindow();
}
