import { describe, it, expect } from 'vitest';
import { parseOutline } from '../../../src/lib/outline';

describe('parseOutline', () => {
  it('should parse headings correctly', () => {
    const markdown = '# Heading 1\n## Heading 2\n### Heading 3';
    const outline = parseOutline(markdown);
    expect(outline).toHaveLength(3);
  });

  it('should handle empty content', () => {
    const outline = parseOutline('');
    expect(outline).toHaveLength(0);
  });
});
