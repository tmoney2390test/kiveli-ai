import { oneTapSelfiePhotoRequest } from '@together/domain/src/media';
import { customPhotoRequestText } from './photoRequestPresentation';

export function groupPhotoRequestText(names: string[], spicy: boolean, description?: string): string {
  const addressed = names.map((name) => name.trim()).filter(Boolean).join(' and ');
  if (!addressed) return '';
  const custom = customPhotoRequestText(description ?? '');
  if (custom) return `${addressed}, ${custom[0]!.toLowerCase()}${custom.slice(1)}`;

  const quick = oneTapSelfiePhotoRequest(spicy);
  const groupQuick = names.length > 1
    ? quick.replace('an explicit nude selfie', 'an explicit nude photo of you together')
      .replace('a selfie', 'a photo of you together')
    : quick;
  return `${addressed}, ${groupQuick[0]!.toLowerCase()}${groupQuick.slice(1)}`;
}
