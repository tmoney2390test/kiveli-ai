import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, X } from 'lucide-react-native';

import {
  cleanupNormalizedImage,
  normalizeUserImage,
  userImagePickerOptions,
} from '../../lib/imageUploads';
import { createClientRequestId } from '../../lib/requestId';

import { colors } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import {
  type DraftScreenshot,
  parseScreenshots,
  refreshScreenshots,
  removeScreenshot,
  uploadSupportScreenshot,
  withScreenshotTimeout,
} from './attachments';

export function SupportScreenshots(
  { value, onChange, disabled, onBusy }: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    onBusy: (busy: boolean) => void;
  },
) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const rows = parseScreenshots(value), latest = useRef(rows);
  latest.current = rows;
  const [urls, setUrls] = useState<Record<string, string>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState<string | null>(null),
    [pickerError, setPickerError] = useState('');
  const alive = useRef(true), lock = useRef(false), change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const update = (next: DraftScreenshot[]) => {
    latest.current = next;
    change.current(JSON.stringify(next));
  };
  const ids = rows.map((row) => row.id).join(',');
  useEffect(() => {
    if (!ids) return;
    let active = true;
    void refreshScreenshots(ids.split(','), userId).then((result) => {
      if (!active) return;
      setUrls(
        Object.fromEntries(
          result.attachments.filter((row) => row.url).map((row) => [row.id, row.url!]),
        ),
      );
      const ready = new Set(
        result.attachments.filter((row) => row.status === 'ready').map((row) => row.id),
      );
      if (latest.current.some((row) => !row.ready && ready.has(row.id))) {
        update(latest.current.map((row) => ({ ...row, ready: row.ready || ready.has(row.id) })));
      }
    }).catch(() => {/* Keep saved previews and retry controls through a temporary outage. */});
    return () => {
      active = false;
    };
  }, [ids]);
  const run = async (row: DraftScreenshot) => {
    setBusy(row.id);
    setErrors((current) => ({ ...current, [row.id]: '' }));
    try {
      const result = await uploadSupportScreenshot(row, userId);
      if (!alive.current) return;
      if (result.url) setUrls((current) => ({ ...current, [row.id]: result.url! }));
      update(latest.current.map((item) => item.id === row.id ? { ...item, ready: true } : item));
    } catch (error) {
      if (alive.current) {
        setErrors((current) => ({
          ...current,
          [row.id]: error instanceof Error ? error.message : 'Upload interrupted. Tap Retry.',
        }));
      }
    }
  };
  const retry = async (row: DraftScreenshot) => {
    if (lock.current || disabled) return;
    lock.current = true;
    onBusy(true);
    try {
      await run(row);
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(null);
        onBusy(false);
      }
    }
  };
  const pick = async () => {
    if (lock.current || disabled || latest.current.length >= 3) return;
    lock.current = true;
    onBusy(true);
    setPickerError('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync(userImagePickerOptions('library'));
      if (picked.canceled || !alive.current) return;
      const asset = picked.assets[0];
      if (!asset) return;
      const normalized = await withScreenshotTimeout(normalizeUserImage(
        { ...asset, fileName: asset.fileName },
        .85,
        2048,
      ), 'Screenshot preparation took too long. Choose it again.');
      if (!alive.current) {
        cleanupNormalizedImage(normalized.uri);
        return;
      }
      if (normalized.byteSize > 5242880) throw new Error('Choose a screenshot under 5 MB.');
      const row = {
        id: createClientRequestId(),
        width: normalized.width,
        height: normalized.height,
        byteSize: normalized.byteSize,
        uri: normalized.uri,
        ready: false,
      };
      update([...latest.current, row]);
      await run(row);
    } catch (error) {
      if (alive.current) {
        setPickerError(error instanceof Error ? error.message : 'Screenshot could not be added.');
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(null);
        onBusy(false);
      }
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={s.row}>
        {rows.map((row, index) => (
          <View key={row.id} style={{ gap: 4, maxWidth: 150 }}>
            <View style={s.thumb}>
              <Image
                source={{ uri: urls[row.id] ?? row.uri }}
                style={StyleSheet.absoluteFill}
                cachePolicy='none'
                contentFit='cover'
              />
              {busy === row.id
                ? (
                  <View style={s.shade}>
                    <ActivityIndicator color={colors.text} />
                  </View>
                )
                : null}
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={`Remove screenshot ${index + 1}`}
                disabled={disabled || !!busy}
                style={s.remove}
                onPress={() => {
                  update(latest.current.filter((item) => item.id !== row.id));
                  cleanupNormalizedImage(row.uri);
                  void removeScreenshot(row.id, userId).catch(() => {});
                }}
              >
                <X size={18} color={colors.text} />
              </Pressable>
            </View>
            {!row.ready && busy !== row.id
              ? (
                <Pressable
                  accessibilityRole='button'
                  disabled={disabled}
                  onPress={() => void retry(row)}
                  style={s.retry}
                >
                  <Text style={s.link}>Retry upload</Text>
                </Pressable>
              )
              : null}
            {!row.ready && errors[row.id]
              ? <Text accessibilityRole='alert' style={s.error}>{errors[row.id]}</Text>
              : null}
            {row.ready ? <Text style={s.link}>Attached</Text> : null}
          </View>
        ))}
      </View>
      {rows.length < 3
        ? (
          <Pressable
            accessibilityRole='button'
            disabled={disabled || !!busy}
            onPress={() => void pick()}
            style={s.add}
          >
            <ImagePlus size={20} color={colors.violet} />
            <Text style={s.link}>Add screenshots · {rows.length}/3</Text>
          </Pressable>
        )
        : null}
      {pickerError ? <Text accessibilityRole='alert' style={s.error}>{pickerError}</Text> : null}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remove: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.7)',
    borderBottomLeftRadius: 14,
  },
  add: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: { color: colors.violet, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  retry: { minHeight: 44, justifyContent: 'center' },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
