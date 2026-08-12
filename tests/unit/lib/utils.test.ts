import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../../../src/lib/utils';

describe('getErrorMessage', () => {
  it('should extract message from Error instance', () => {
    const error = new Error('Test error message');
    expect(getErrorMessage(error)).toBe('Test error message');
  });

  it('should handle string errors', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should handle number errors', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('should handle null/undefined', () => {
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('should handle object errors', () => {
    expect(getErrorMessage({ code: 'ERR_001' })).toBe('[object Object]');
  });
});
