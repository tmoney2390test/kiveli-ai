import type { SupabaseClient } from '@supabase/supabase-js';

export type IosExplicitDialogueControl = {
  enabled: boolean;
  available: boolean;
  updatedAt: string | null;
};

/** Fail closed if the migration is absent or the control cannot be read. */
export async function readIosExplicitDialogueControl(db: SupabaseClient): Promise<IosExplicitDialogueControl> {
  try {
    const { data, error } = await db.from('together_ops_content_controls')
      .select('enabled,updated_at')
      .eq('control_key', 'ios_explicit_dialogue')
      .maybeSingle();
    if (error || !data) return { enabled: false, available: false, updatedAt: null };
    return {
      enabled: data.enabled === true,
      available: true,
      updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
    };
  } catch {
    return { enabled: false, available: false, updatedAt: null };
  }
}

export function nativeDialogueSurface(verifiedWeb: boolean, platformHeader: string | null): 'web' | 'ios' | 'android' | 'native_or_unknown' {
  if (verifiedWeb) return 'web';
  if (platformHeader === 'ios') return 'ios';
  if (platformHeader === 'android') return 'android';
  return 'native_or_unknown';
}

export function privateTextModeForSurface(
  configuredMode: 'off' | 'shadow' | 'on',
  surface: 'web' | 'ios' | 'android' | 'native_or_unknown',
  iosExplicitEnabled: boolean,
): 'off' | 'shadow' | 'on' {
  return (surface === 'ios' || surface === 'native_or_unknown') && !iosExplicitEnabled
    ? 'off'
    : configuredMode;
}
