import { describe, expect, it } from 'vitest';
import { exportStatusCopy, passwordCheck, validAccountEmail } from './accountSecurity';

describe('account security presentation', () => {
  it('requires a useful password baseline', () => {
    expect(passwordCheck('short').valid).toBe(false);
    expect(passwordCheck('LongerPassword7').valid).toBe(true);
    expect(passwordCheck('LongerPassword7').label).toBe('Strong');
  });

  it('validates complete email addresses', () => {
    expect(validAccountEmail('person@example.com')).toBe(true);
    expect(validAccountEmail('person@')).toBe(false);
  });

  it('explains private export lifecycle states', () => {
    expect(exportStatusCopy('processing')).toContain('private ZIP');
    expect(exportStatusCopy('expired')).toContain('expired');
  });
});
