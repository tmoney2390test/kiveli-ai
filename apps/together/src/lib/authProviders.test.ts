import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { authProviderState } from './authProviders';

const user = (value: Partial<User>) => value as User;

describe('auth provider presentation', () => {
  it('recognizes a verified Google-only account', () => {
    expect(authProviderState(user({ identities: [{ provider: 'google' } as never], app_metadata: {}, user_metadata: {} }))).toMatchObject({ label: 'Signed in with Google', hasPassword: false, verifiedEmail: true });
  });

  it('recognizes linked Google and password identities plus pending email changes', () => {
    expect(authProviderState(user({ identities: [{ provider: 'google' } as never, { provider: 'email' } as never], app_metadata: {}, user_metadata: {}, new_email: 'new@example.com' }))).toMatchObject({ label: 'Signed in with Google + password', hasPassword: true, pendingEmail: 'new@example.com' });
  });

  it('recognizes an Apple identity as verified without implying a password', () => {
    expect(authProviderState(user({ identities: [{ provider: 'apple' } as never], app_metadata: {}, user_metadata: {} }))).toMatchObject({ label: 'Signed in with Apple', hasPassword: false, verifiedEmail: true });
  });
});
