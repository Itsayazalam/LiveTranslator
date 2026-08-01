import { describe, expect, it } from 'vitest';
import { getLanguagePairLabel } from '../stores/ui-store';

describe('getLanguagePairLabel', () => {
  it('formats EN → HI', () => {
    expect(getLanguagePairLabel('en-AU', 'hi')).toBe('EN → HI');
  });

  it('formats HI → EN', () => {
    expect(getLanguagePairLabel('hi', 'en-AU')).toBe('HI → EN');
  });
});
