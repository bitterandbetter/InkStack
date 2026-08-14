import type { ViewMode } from './documents';

export interface UiState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  aiPanelOpen: boolean;
  aiPanelTab: 'ai' | 'outline' | 'code' | 'settings';
  toggleAiPanel: () => void;
  setAiPanelTab: (tab: 'ai' | 'outline' | 'code' | 'settings') => void;
  openAiPanelTab: (tab: 'ai' | 'outline' | 'code' | 'settings') => void;
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  knowledgeGraphOpen: boolean;
  toggleKnowledgeGraph: () => void;
}

export function createUiSlice(set: any): UiState {
  return {
    viewMode: 'split',
    setViewMode: (mode) => set({ viewMode: mode }),
    sidebarOpen: true,
    toggleSidebar: () => set((state: UiState) => ({ sidebarOpen: !state.sidebarOpen })),
    aiPanelOpen: false,
    aiPanelTab: 'ai',
    toggleAiPanel: () => set((state: UiState) => ({ aiPanelOpen: !state.aiPanelOpen })),
    setAiPanelTab: (tab) => set({ aiPanelTab: tab }),
    openAiPanelTab: (tab) => set({ aiPanelOpen: true, aiPanelTab: tab }),
    commandPaletteOpen: false,
    openCommandPalette: () => set({ commandPaletteOpen: true }),
    closeCommandPalette: () => set({ commandPaletteOpen: false }),
    toggleCommandPalette: () => set((state: UiState) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
    knowledgeGraphOpen: false,
    toggleKnowledgeGraph: () => set((state: UiState) => ({ knowledgeGraphOpen: !state.knowledgeGraphOpen }))
  };
}
