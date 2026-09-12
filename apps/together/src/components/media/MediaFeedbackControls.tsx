import { useEffect, useState } from 'react';
import { Alert, Pressable, View, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { ThumbsDown, ThumbsUp } from 'lucide-react-native';
import type { GeneratedMedia } from '../../types';
import { rateGeneratedMedia } from '../../lib/api';
import { styles } from '../../styles/mediaStyles';

export function MediaFeedbackControls(
  { media, style }: { media: GeneratedMedia; style?: ViewStyle },
) {
  const [selected, setSelected] = useState<"positive" | "negative" | null>(
    media.user_feedback ?? null,
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => setSelected(media.user_feedback ?? null), [
    media.id,
    media.user_feedback,
  ]);
  const submit = async (
    event: GestureResponderEvent,
    feedback: "positive" | "negative",
  ) => {
    event.stopPropagation?.();
    if (busy || selected === feedback) return;
    const previous = selected;
    setSelected(feedback);
    setBusy(true);
    try {
      await rateGeneratedMedia(media.id, feedback);
    } catch (error) {
      setSelected(previous);
      Alert.alert(
        "Feedback not saved",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View accessibilityLabel="Rate this photo" style={[styles.feedback, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="This photo looks good"
        accessibilityState={{
          selected: selected === "positive",
          disabled: busy,
        }}
        disabled={busy}
        onPress={(event) =>
          void submit(event, "positive")}
        style={[
          styles.feedbackButton,
          selected === "positive" && styles.feedbackButtonSelected,
        ]}
      >
        <ThumbsUp
          size={13}
          color="#fff"
          fill={selected === "positive" ? "#fff" : "transparent"}
          strokeWidth={2}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="This photo looks wrong"
        accessibilityState={{
          selected: selected === "negative",
          disabled: busy,
        }}
        disabled={busy}
        onPress={(event) =>
          void submit(event, "negative")}
        style={[
          styles.feedbackButton,
          selected === "negative" && styles.feedbackButtonSelected,
        ]}
      >
        <ThumbsDown
          size={13}
          color="#fff"
          fill={selected === "negative" ? "#fff" : "transparent"}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}
