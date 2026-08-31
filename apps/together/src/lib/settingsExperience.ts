export const settingsSectionIds = ['profile', 'account', 'identity', 'experience', 'relationships', 'privacy', 'support'] as const;

export type SettingsSection = typeof settingsSectionIds[number];

export type ProfileDraft = {
  name: string;
  about: string;
  interests: string;
  goals: string;
};

export function settingsSectionFromParam(value?: string | string[] | null): SettingsSection | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return settingsSectionIds.find((section) => section === candidate) ?? null;
}

export function settingsSearchMatches(query: string, ...values: Array<string | null | undefined>) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = values.filter(Boolean).join(' ').toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function normalizeProfileDraft(draft: ProfileDraft): ProfileDraft {
  return {
    name: draft.name.trim(),
    about: draft.about.trim(),
    interests: normalizeList(draft.interests, 10),
    goals: normalizeList(draft.goals, 4),
  };
}

export function profileDraftChanged(saved: ProfileDraft | null, current: ProfileDraft) {
  if (!saved) return false;
  return JSON.stringify(normalizeProfileDraft(saved)) !== JSON.stringify(normalizeProfileDraft(current));
}

export function settingsCloseTarget(canGoBack: boolean): 'back' | 'home' {
  return canGoBack ? 'back' : 'home';
}

function normalizeList(value: string, limit: number) {
  return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, limit).join(', ');
}
