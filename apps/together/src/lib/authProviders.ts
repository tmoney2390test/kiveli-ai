import type { User } from '@supabase/supabase-js';

export type AuthProviderState = {
  providers: Array<'google' | 'apple' | 'email'>;
  label: string;
  hasPassword: boolean;
  verifiedEmail: boolean;
  pendingEmail: string | null;
};

export function authProviderState(user: User | null | undefined): AuthProviderState {
  if (!user) return { providers: [], label: 'Signed out', hasPassword: false, verifiedEmail: false, pendingEmail: null };
  const values = new Set<string>();
  for (const identity of user.identities ?? []) if (identity.provider) values.add(identity.provider);
  const metadataProviders = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : [];
  for (const provider of metadataProviders) if (typeof provider === 'string') values.add(provider);
  if (typeof user.app_metadata?.provider === 'string') values.add(user.app_metadata.provider);
  const providers = (['google', 'apple', 'email'] as const).filter((provider) => values.has(provider));
  const names = providers.map((provider) => provider === 'email' ? 'password' : provider === 'google' ? 'Google' : 'Apple');
  const label = names.length ? `Signed in with ${joinProviderNames(names)}` : 'Signed in';
  return {
    providers,
    label,
    hasPassword: providers.includes('email'),
    verifiedEmail: Boolean(user.email_confirmed_at) || providers.includes('google') || providers.includes('apple'),
    pendingEmail: typeof user.new_email === 'string' && user.new_email.trim() ? user.new_email : null,
  };
}

function joinProviderNames(names: string[]) {
  if (names.length < 2) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} + ${names.at(-1)}`;
}
