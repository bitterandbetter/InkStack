import { invoke } from '@tauri-apps/api/core';

export async function saveExportFile(
  suggestedName: string,
  contents: string,
  extension: 'svg' | 'png',
  kind: 'svg' | 'png'
): Promise<string | null> {
  return invoke<string | null>('save_export_file', {
    request: {
      suggested_name: suggestedName,
      contents,
      extension,
      kind
    }
  });
}
