import { describe, expect, it } from 'vitest';
import { EMAIL_CODE_LENGTH, emailCodeReady, emailCodeResendSeconds, normalizeEmailAddress, normalizeEmailCode } from './emailCodeAuth';

describe('email code authentication helpers', () => {
  it('normalizes an email without rejecting delivery before Supabase attempts it', () => {
    expect(normalizeEmailAddress('  Person@Example.COM ')).toBe('person@example.com');
  });

  it('keeps only the six OTP digits users can submit', () => {
    expect(normalizeEmailCode('12 3a45-678')).toBe('123456');
    expect(normalizeEmailCode('12345')).toHaveLength(EMAIL_CODE_LENGTH - 1);
  });

  it('requires a complete code and computes a bounded resend countdown', () => {
    expect(emailCodeReady('123456')).toBe(true);
    expect(emailCodeReady('12345')).toBe(false);
    expect(emailCodeResendSeconds(61_000, 1_001)).toBe(60);
    expect(emailCodeResendSeconds(1_000, 1_001)).toBe(0);
  });
});
