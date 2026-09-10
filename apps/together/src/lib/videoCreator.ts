export const VIDEO_ACCENT = '#C9A5F0';
export const VIDEO_ACCENT_FILL = 'rgba(201,165,240,.16)';
export type VideoPromptIdea = { label: string; prompt: string };

export function videoPromptIdeas(character?: { name: string; occupation?: string }, location = '', existingPhoto = false): VideoPromptIdea[] {
  const subject = character?.name || 'The person in the photo';
  const smile = { label: 'A knowing smile', prompt: `${subject} looks toward me and gives a slow, knowing smile.` };
  // Existing photos keep their visible props; role suggestions are for new scenes.
  const context = existingPhoto ? '' : `${character?.occupation ?? ''} ${location}`;
  const specific = /bartend|saloon|tavern|pub\b|bar\b|mixolog/i.test(context)
    ? { label: 'Raise a glass', prompt: `${subject} lifts a glass in a quiet toast, then gives me a knowing smile.` }
    : /musician|singer|dancer|performer/i.test(context)
    ? { label: 'Sway to the rhythm', prompt: `${subject} sways gently to a rhythm, then glances toward me with a smile.` }
    : /artist|painter|sculptor/i.test(context)
    ? { label: 'Pause and look up', prompt: `${subject} pauses, looks up thoughtfully, and meets my gaze.` }
    : { label: 'A quiet laugh', prompt: `${subject} lets out a quiet laugh, then looks back toward me.` };
  return [smile, specific, { label: 'Turn toward me', prompt: `${subject} turns toward me, holds my gaze, and smiles softly.` }];
}

export function videoCreateDisabledReason(input: {
  submitting: boolean; loading: boolean; available: boolean; activeVideo: boolean;
  insufficient: boolean; locationReady?: boolean; prompt: string; validSettings: boolean;
}): string | null {
  if (input.submitting) return 'Starting your video…';
  if (input.loading) return 'Checking your balance and video availability…';
  if (!input.available) return 'Video is unavailable for this account or photo right now.';
  if (input.activeVideo) return 'Finish your active video before starting another.';
  if (input.insufficient) return 'Add credits or choose lower-cost settings.';
  if (input.locationReady === false) return 'Choose a location for this moment.';
  if (input.prompt.trim().length < 2) return 'Describe a moment or choose an idea.';
  if (!input.validSettings) return 'Choose supported video settings.';
  return null;
}
