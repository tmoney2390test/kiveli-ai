import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

type CompanionOption = {
  id: string;
  together_character_templates: { slug: string; public_handle?: string | null };
};

const storagePrefix = 'kivelli:moments-companion-filter:v1:';

export function explicitMomentsCompanionSelection(requested: string | undefined, companions: CompanionOption[]): string | undefined {
  if (!requested) return undefined;
  if (requested === 'all') return 'all';
  return companions.find((item) => item.id === requested || item.together_character_templates.slug === requested || item.together_character_templates.public_handle === requested)?.id;
}

export function restoredMomentsCompanionSelection(stored: string | null, companions: CompanionOption[], fallback: string): string {
  if (stored === 'all') return 'all';
  return companions.some((item) => item.id === stored) ? stored as string : fallback;
}

async function storageKey(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ? `${storagePrefix}${data.session.user.id}` : null;
}

export async function loadMomentsCompanionSelection(): Promise<string | null> {
  try {
    const key = await storageKey();
    return key ? await AsyncStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export async function saveMomentsCompanionSelection(selection: string): Promise<void> {
  try {
    const key = await storageKey();
    if (key) await AsyncStorage.setItem(key, selection);
  } catch {
    // The filter still works for the current visit if device storage is unavailable.
  }
}
