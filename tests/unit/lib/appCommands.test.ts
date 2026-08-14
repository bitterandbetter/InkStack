import { beforeEach, describe, expect, it } from 'vitest';
import { runAppCommand } from '../../../src/lib/appCommands';
import { useStore } from '../../../src/store';

describe('AI panel command navigation', () => {
  beforeEach(() => {
    useStore.setState({ aiPanelOpen: false, aiPanelTab: 'ai' });
  });

  it.each([
    ['ai-chat', 'ai'],
    ['ai-outline', 'outline'],
    ['ai-code', 'code'],
    ['ai-settings', 'settings']
  ] as const)('opens %s at the expected panel tab', async (command, expectedTab) => {
    await runAppCommand(command);
    expect(useStore.getState().aiPanelOpen).toBe(true);
    expect(useStore.getState().aiPanelTab).toBe(expectedTab);
  });
});
