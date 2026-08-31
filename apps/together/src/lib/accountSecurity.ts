export type PasswordCheck = { valid: boolean; score: number; label: 'Too weak' | 'Fair' | 'Strong'; requirements: string[] };

export function passwordCheck(password: string): PasswordCheck {
  const checks = [password.length >= 10, /[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password)];
  const score = checks.filter(Boolean).length;
  return {
    valid: score === checks.length,
    score,
    label: score === 4 ? 'Strong' : score >= 3 ? 'Fair' : 'Too weak',
    requirements: [!checks[0] ? '10 or more characters' : '', !checks[1] || !checks[2] ? 'uppercase and lowercase letters' : '', !checks[3] ? 'at least one number' : ''].filter(Boolean),
  };
}

export function validAccountEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function exportStatusCopy(status: string): string {
  if (status === 'queued') return 'Queued securely…';
  if (status === 'processing') return 'Preparing your private ZIP…';
  if (status === 'ready') return 'Your private download is ready for 24 hours.';
  if (status === 'expired') return 'That download expired. Create a new export when you need one.';
  return 'The export could not be prepared. You can try again.';
}
