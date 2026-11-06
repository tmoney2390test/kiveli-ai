import { Platform, Share } from 'react-native';
import type { GeneratedMedia } from '../types';
import { privateMediaPlaybackUrl } from './privateMediaUrl';
import { supabaseUrl } from './supabase';

function mediaExtension(media: Pick<GeneratedMedia, 'media_type' | 'content_type'>): string {
  const mime = media.content_type?.toLowerCase().split(';')[0];
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime === 'video/quicktime') return 'mov';
  return media.media_type === 'video' ? 'mp4' : 'jpg';
}

export async function saveGeneratedMedia(media: GeneratedMedia): Promise<'downloaded' | 'saved' | 'share_sheet'> {
  if (media.status !== 'ready' || !media.signed_url || media.media_type === 'voice_note') {
    throw new Error('This photo or video is not ready to save yet.');
  }
  const name = `Kivelle-${media.id}.${mediaExtension(media)}`;
  const url = privateMediaPlaybackUrl(media.signed_url, Platform.OS, supabaseUrl) ?? media.signed_url;
  if (Platform.OS === 'web') {
    const response = await fetch(url);
    if (!response.ok) throw new Error('The secure media link could not be downloaded. Please try again.');
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
    return 'downloaded';
  }
  const { File, Paths } = await import('expo-file-system');
  const downloaded = await File.downloadFileAsync(url, new File(Paths.cache, name), { idempotent: true });
  try {
    try {
      const { Asset, requestPermissionsAsync } = await import('expo-media-library');
      const permission = await requestPermissionsAsync(true, [media.media_type === 'video' ? 'video' : 'photo']);
      if (!permission.granted) throw new Error('Allow Kivelle to add media to Photos in device settings, then try again.');
      await Asset.create(downloaded.uri);
      return 'saved';
    } catch (error) {
      // Existing TestFlight binaries predate the Photos module. Their iOS share
      // sheet still offers Save Image / Save Video until a new binary ships.
      if (Platform.OS !== 'ios' || !/ExpoMediaLibrary|native module/i.test(String(error))) throw error;
      await Share.share({ url: downloaded.uri });
      return 'share_sheet';
    }
  } finally {
    downloaded.delete();
  }
}
